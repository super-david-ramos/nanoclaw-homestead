/**
 * Phase 2 T-2.2 — install the recurring fs-watcher into the family agent's
 * session.
 *
 * Mirrors scripts/init-morning-briefing.ts (T-2.1) in shape: resolves the
 * family agent group, finds its active session, opens inbound.db, calls the
 * idempotent helper. Cross-process-safe with the running host
 * (busy_timeout=5000, journal_mode=DELETE).
 *
 * The default script body assumes the iCloud Obsidian vault is mounted at
 * /workspace/extra/Homestead inside the family container. That mount is
 * configured in groups/family/container.json (additionalMounts) AND in the
 * mount-security allowlist at ~/.config/nanoclaw/mount-allowlist.json. If
 * either is missing, the script will fire every 15 minutes but vault-hash
 * will report `vaultMissing:true` and wakeAgent:false — visible in the host
 * log, harmless until you fix the mount.
 *
 * Usage:
 *   pnpm exec tsx scripts/init-fs-watcher.ts \
 *     [--folder family] \
 *     [--cron "*\/15 * * * *"] \
 *     [--script "<custom bash one-liner>"] \
 *     [--prompt-file path/to/prompt.md]
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
  DEFAULT_FS_WATCHER_SCRIPT,
  FS_WATCHER_SERIES_ID,
  scheduleFsWatcher,
} from '../src/modules/scheduling/fs-watcher.js';

const DEFAULT_PROMPT = `The household Obsidian vault changed.

The script attached a diff in your scriptOutput.data:
  - added:    relpaths newly present
  - removed:  relpaths gone
  - modified: relpaths whose content changed

You have read access to the vault at /workspace/extra/Homestead — open any
of the changed files to see what's actually in them before deciding.

Send a short note in the family chat that names what changed and adds value
the household wouldn't get from just looking at the file list — e.g. surface
a new project the household started, flag a meaningful edit to an area
note, point out something worth their attention. One or two sentences.

Stay silent only when the change is obviously trivial (e.g. a single file
under areas/log/ that the household maintains as a stream-of-consciousness
log and doesn't need surfaced).`;

const DEFAULT_CRON = '*/15 * * * *';
const DEFAULT_FOLDER = 'family';

interface Args {
  folder: string;
  cron: string;
  prompt: string;
  script: string;
}

function parseArgs(argv: string[]): Args {
  let folder = DEFAULT_FOLDER;
  let cron = DEFAULT_CRON;
  let prompt = DEFAULT_PROMPT;
  let script = DEFAULT_FS_WATCHER_SCRIPT;
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
      case '--script':
        script = (val ?? '').trim() || DEFAULT_FS_WATCHER_SCRIPT;
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
  return { folder, cron, prompt, script };
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
    process.exit(2);
  }

  const mg = wiredGroups[0];
  const session = findSessionForAgent(ag.id, mg.id, null);
  if (!session) {
    console.error(`Agent group ${ag.id} has no active session for messaging group ${mg.id}.`);
    console.error(`Send a message into the wired chat to spin up a session, then re-run.`);
    process.exit(2);
  }

  const inDb = openInboundDb(ag.id, session.id);
  try {
    const result = scheduleFsWatcher(inDb, {
      prompt: args.prompt,
      cron: args.cron,
      script: args.script,
      timezone: TIMEZONE,
    });

    console.log('');
    if (result.created) {
      console.log(`fs-watcher scheduled.`);
    } else {
      console.log(`fs-watcher already installed (idempotent no-op).`);
    }
    console.log(`  agent group:  ${ag.name} [${ag.id}]`);
    console.log(`  session:      ${session.id}`);
    console.log(`  series id:    ${FS_WATCHER_SERIES_ID}`);
    console.log(`  live row id:  ${result.taskId}`);
    console.log(`  cron:         ${args.cron}  (timezone: ${TIMEZONE})`);
    console.log('');
    console.log(`Inspect with:`);
    console.log(
      `  sqlite3 data/v2-sessions/${ag.id}/${session.id}/inbound.db "SELECT id, status, recurrence, process_after FROM messages_in WHERE series_id = '${FS_WATCHER_SERIES_ID}';"`,
    );
  } finally {
    inDb.close();
  }
}

main();
