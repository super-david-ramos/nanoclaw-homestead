/**
 * Phase 2 T-2.1 — install the recurring morning briefing into the family
 * agent's session.
 *
 * Idempotent: a second run is a no-op (helper finds the live row by series_id
 * and returns it). Cross-process-safe with the running host: the inbound.db
 * connection uses busy_timeout=5000 so concurrent writes from the sweep
 * serialize cleanly under journal_mode=DELETE. No service restart needed.
 *
 * Usage:
 *   pnpm exec tsx scripts/init-morning-briefing.ts \
 *     [--folder family] \
 *     [--cron "45 6 * * *"] \
 *     [--prompt-file path/to/prompt.md]
 *
 * The default prompt is a generic "morning briefing" instruction. Override
 * via --prompt-file when iterating without re-deploying.
 */
import fs from 'fs';
import path from 'path';

import { DATA_DIR, TIMEZONE } from '../src/config.js';
import { getAgentGroupByFolder } from '../src/db/agent-groups.js';
import { initDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { findSessionForAgent } from '../src/db/sessions.js';
import { getMessagingGroupsByAgentGroup } from '../src/db/messaging-groups.js';
import { openInboundDb } from '../src/session-manager.js';
import {
  MORNING_BRIEFING_SERIES_ID,
  scheduleMorningBriefing,
} from '../src/modules/scheduling/morning-briefing.js';

const DEFAULT_PROMPT = `Good morning. Send a brief morning update for the household.

Pull together what matters for today. Keep it short — a few lines, not a wall
of text. Use the channel's normal formatting. If there's nothing
substantive to surface, say so plainly rather than padding the message.`;

const DEFAULT_CRON = '45 6 * * *';
const DEFAULT_FOLDER = 'family';

interface Args {
  folder: string;
  cron: string;
  prompt: string;
}

function parseArgs(argv: string[]): Args {
  let folder = DEFAULT_FOLDER;
  let cron = DEFAULT_CRON;
  let prompt = DEFAULT_PROMPT;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--folder':
        folder = (val ?? '').trim() || DEFAULT_FOLDER;
        i++;
        break;
      case '--cron':
        cron = (val ?? '').trim() || DEFAULT_CRON;
        i++;
        break;
      case '--prompt-file': {
        const p = path.resolve((val ?? '').trim());
        if (!p) {
          console.error('Missing path for --prompt-file');
          process.exit(2);
        }
        prompt = fs.readFileSync(p, 'utf8').trim();
        i++;
        break;
      }
    }
  }
  return { folder, cron, prompt };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const db = initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(db);

  const ag = getAgentGroupByFolder(args.folder);
  if (!ag) {
    console.error(`No agent group found for folder=${args.folder}.`);
    console.error(`Run scripts/init-family-agent.ts first.`);
    process.exit(2);
  }

  const wiredGroups = getMessagingGroupsByAgentGroup(ag.id);
  if (wiredGroups.length === 0) {
    console.error(`Agent group ${ag.id} (${ag.name}) is not wired to any messaging group.`);
    console.error(`Run scripts/init-family-agent.ts to wire a Telegram chat first.`);
    process.exit(2);
  }

  // The family agent uses session_mode='shared' in production, so thread_id
  // is null. If the user wires multiple chats to the same agent, we install
  // the briefing into the first one; making this configurable is owed.
  const mg = wiredGroups[0];
  const session = findSessionForAgent(ag.id, mg.id, null);
  if (!session) {
    console.error(
      `Agent group ${ag.id} has no active session for messaging group ${mg.id}.`,
    );
    console.error(
      `Send a message into the wired chat (Telegram, etc.) to spin up a session, then re-run.`,
    );
    process.exit(2);
  }

  const inDb = openInboundDb(ag.id, session.id);
  try {
    const result = scheduleMorningBriefing(inDb, {
      prompt: args.prompt,
      cron: args.cron,
      timezone: TIMEZONE,
    });

    console.log('');
    if (result.created) {
      console.log(`Morning briefing scheduled.`);
    } else {
      console.log(`Morning briefing already installed (idempotent no-op).`);
    }
    console.log(`  agent group:  ${ag.name} [${ag.id}]`);
    console.log(`  session:      ${session.id}`);
    console.log(`  series id:    ${MORNING_BRIEFING_SERIES_ID}`);
    console.log(`  live row id:  ${result.taskId}`);
    console.log(`  cron:         ${args.cron}  (timezone: ${TIMEZONE})`);
    console.log('');
    console.log(`Inspect with:`);
    console.log(
      `  sqlite3 data/v2-sessions/${ag.id}/${session.id}/inbound.db "SELECT id, status, recurrence, process_after FROM messages_in WHERE series_id = '${MORNING_BRIEFING_SERIES_ID}';"`,
    );
  } finally {
    inDb.close();
  }
}

main();
