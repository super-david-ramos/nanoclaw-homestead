/**
 * Init the family agent group and wire it to a Telegram group chat.
 *
 * Mirrors scripts/init-first-agent.ts but for the group-chat case (is_group=1,
 * engage_mode='mention' by default). No CLI welcome — a synthetic broadcast
 * into a real family group chat would be awkward; let a human start the
 * conversation.
 *
 * Creates/reuses (idempotent):
 *   - groups/<folder>/ PARA + skills scaffold (bootstrapFamilyFolder)
 *   - agent_groups row (name=Barnaby, folder=family) + on-disk filesystem
 *     state via initGroupFilesystem (CLAUDE.local.md, container.json,
 *     .claude-shared/)
 *   - messaging_groups row (channel_type=telegram, is_group=1)
 *   - messaging_group_agents wiring with the chosen engage_mode
 *
 * Usage:
 *   pnpm exec tsx scripts/init-family-agent.ts \
 *     --telegram-chat-id -1001234567890 \
 *     [--agent-name Barnaby] \
 *     [--folder family] \
 *     [--group-name "Family chat"] \
 *     [--engage-mode mention | mention-sticky | pattern] \
 *     [--engage-pattern '<regex>']    # only used with --engage-mode pattern
 *
 * Requires the host service NOT to be running for write safety, OR the WAL
 * mode to be in effect (it is — see initDb). Either way, no socket round-trip
 * is required since we don't deliver a welcome.
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { initDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { ensureFamilyAgent, FAMILY_DEFAULTS } from '../src/family-agent-bootstrap.js';
import { bootstrapFamilyFolder } from '../src/family-bootstrap.js';
import { GROUPS_DIR } from '../src/config.js';
import { initGroupFilesystem } from '../src/group-init.js';
import type { EngageMode } from '../src/types.js';

interface Args {
  telegramChatId: string;
  agentName: string;
  folder: string;
  groupName: string | null;
  engageMode: EngageMode;
  engagePattern: string | null;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--telegram-chat-id':
        out.telegramChatId = val;
        i++;
        break;
      case '--agent-name':
        out.agentName = val;
        i++;
        break;
      case '--folder':
        out.folder = val;
        i++;
        break;
      case '--group-name':
        out.groupName = val;
        i++;
        break;
      case '--engage-mode': {
        const raw = (val ?? '').toLowerCase();
        if (raw !== 'mention' && raw !== 'mention-sticky' && raw !== 'pattern') {
          console.error(`Invalid --engage-mode: ${raw} (expected 'mention', 'mention-sticky', or 'pattern')`);
          process.exit(2);
        }
        out.engageMode = raw;
        i++;
        break;
      }
      case '--engage-pattern':
        out.engagePattern = val;
        i++;
        break;
    }
  }

  if (!out.telegramChatId) {
    console.error('Missing required arg: --telegram-chat-id');
    console.error('See scripts/init-family-agent.ts header for usage.');
    process.exit(2);
  }

  return {
    telegramChatId: out.telegramChatId,
    agentName: out.agentName?.trim() || FAMILY_DEFAULTS.agentName,
    folder: out.folder?.trim() || FAMILY_DEFAULTS.folder,
    groupName: out.groupName?.trim() || null,
    engageMode: out.engageMode ?? FAMILY_DEFAULTS.engageMode,
    engagePattern: out.engagePattern?.trim() || null,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const db = initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(db);

  // 1. PARA + skills folder scaffold (idempotent).
  const groupDir = path.resolve(GROUPS_DIR, args.folder);
  bootstrapFamilyFolder(groupDir);

  // 2. DB rows: agent group, messaging group, wiring.
  const result = ensureFamilyAgent({
    telegramChatId: args.telegramChatId,
    agentName: args.agentName,
    folder: args.folder,
    groupName: args.groupName,
    engageMode: args.engageMode,
    engagePattern: args.engagePattern,
  });

  // 3. On-disk filesystem state for the agent group (CLAUDE.local.md seeded
  //    with a starter persona, container.json, .claude-shared/). Idempotent
  //    — a hand-edited CLAUDE.local.md is preserved.
  initGroupFilesystem(result.agentGroup, {
    instructions:
      `# ${args.agentName}\n\n` +
      `You are ${args.agentName}, a personal NanoClaw agent for David and his family. ` +
      'When someone first reaches out (or you receive a system welcome prompt), introduce yourself briefly and invite them to chat. Keep replies concise.',
  });

  console.log('');
  console.log('Family agent wired.');
  console.log(`  agent:        ${result.agentGroup.name} [${result.agentGroup.id}] @ groups/${result.agentGroup.folder}`);
  console.log(`  channel:      telegram ${result.messagingGroup.platform_id} (is_group=${result.messagingGroup.is_group})`);
  console.log(`  wiring:       ${result.wiring.id} engage_mode=${result.wiring.engage_mode}`);
  if (result.wiring.engage_pattern) {
    console.log(`  pattern:      ${result.wiring.engage_pattern}`);
  }
  console.log('');
  console.log('Send a message in the family group chat to confirm the bot responds.');
}

main();
