/**
 * Init the BarnabyTest agent — sandbox playground for integration testing
 * against a real Telegram round trip without touching the production family
 * bot or family chat.
 *
 * Wires:
 *   - agent_groups row: name="BarnabyTest", folder="family-test"
 *   - messaging_groups row: channel_type='telegram-test', is_group=0 (DM)
 *   - messaging_group_agents wiring with engage_mode='pattern' '.'
 *     (always engage — same as the family group, since this is a test
 *     sandbox where every message is the user testing something)
 *   - groups/family-test/ scaffold: PARA folders, container.json, no
 *     iCloud mount (pure local fixture vault for this agent)
 *
 * Usage:
 *   pnpm exec tsx scripts/init-test-bot-agent.ts \
 *     --telegram-chat-id <chatId>
 *
 * The chat ID is the DM chat ID with the test bot — fetch via:
 *   curl -s "https://api.telegram.org/bot${TELEGRAM_TEST_BOT_TOKEN}/getUpdates"
 *
 * Idempotent: re-running with the same chat ID is a no-op.
 *
 * Companion env requirement: TELEGRAM_TEST_BOT_TOKEN must be in .env so the
 * channel adapter (src/channels/telegram-test.ts) actually starts polling.
 * Without it, this script will succeed in writing the DB rows but the bot
 * won't be reachable until the env var is added + host restarted.
 */
import path from 'path';

import { DATA_DIR, GROUPS_DIR } from '../src/config.js';
import { initDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { createAgentGroup, getAgentGroup, getAgentGroupByFolder } from '../src/db/agent-groups.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupByPlatform,
} from '../src/db/messaging-groups.js';
import { bootstrapFamilyFolder } from '../src/family-bootstrap.js';
import { initGroupFilesystem } from '../src/group-init.js';
import { namespacedPlatformId } from '../src/platform-id.js';
import type { EngageMode } from '../src/types.js';

const TEST_BOT_DEFAULTS = {
  agentName: 'BarnabyTest',
  folder: 'family-test',
  engageMode: 'pattern' as EngageMode,
  engagePattern: '.',
  // Channel-type intentionally distinct from production 'telegram' so the
  // test adapter (src/channels/telegram-test.ts) routes correctly.
  channelType: 'telegram-test',
} as const;

interface Args {
  telegramChatId: string;
  agentName: string;
  folder: string;
}

function parseArgs(argv: string[]): Args {
  let chatId: string | undefined;
  let agentName = TEST_BOT_DEFAULTS.agentName;
  let folder = TEST_BOT_DEFAULTS.folder;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--telegram-chat-id':
        chatId = val;
        i++;
        break;
      case '--agent-name':
        agentName = (val ?? '').trim() || TEST_BOT_DEFAULTS.agentName;
        i++;
        break;
      case '--folder':
        folder = (val ?? '').trim() || TEST_BOT_DEFAULTS.folder;
        i++;
        break;
    }
  }
  if (!chatId) {
    console.error('Missing required arg: --telegram-chat-id');
    console.error('See scripts/init-test-bot-agent.ts header for usage.');
    process.exit(2);
  }
  return { telegramChatId: chatId, agentName, folder };
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const db = initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(db);

  // 1. PARA + skills folder scaffold (idempotent; no iCloud symlinks for the
  //    test agent — purely local).
  const groupDir = path.resolve(GROUPS_DIR, args.folder);
  bootstrapFamilyFolder(groupDir);

  // 2. Agent group row.
  let ag = getAgentGroupByFolder(args.folder);
  if (!ag) {
    const id = generateId('ag');
    createAgentGroup({
      id,
      name: args.agentName,
      folder: args.folder,
      agent_provider: null,
      created_at: new Date().toISOString(),
    });
    ag = getAgentGroup(id);
  }
  if (!ag) throw new Error(`Failed to resolve agent group for folder=${args.folder}`);

  // 3. Messaging group row — channel-type 'telegram-test' so the test
  //    adapter's inbound events route here, not to production telegram.
  const platformId = namespacedPlatformId('telegram', args.telegramChatId);
  let mg = getMessagingGroupByPlatform(TEST_BOT_DEFAULTS.channelType, platformId);
  if (!mg) {
    createMessagingGroup({
      id: generateId('mg'),
      channel_type: TEST_BOT_DEFAULTS.channelType,
      platform_id: platformId,
      name: 'BarnabyTest DM',
      is_group: 0,
      unknown_sender_policy: 'strict',
      created_at: new Date().toISOString(),
    });
    mg = getMessagingGroupByPlatform(TEST_BOT_DEFAULTS.channelType, platformId);
  }
  if (!mg) throw new Error(`Failed to resolve messaging group for ${platformId}`);

  // 4. Wire them.
  let wiring = getMessagingGroupAgentByPair(mg.id, ag.id);
  if (!wiring) {
    createMessagingGroupAgent({
      id: generateId('mga'),
      messaging_group_id: mg.id,
      agent_group_id: ag.id,
      engage_mode: TEST_BOT_DEFAULTS.engageMode,
      engage_pattern: TEST_BOT_DEFAULTS.engagePattern,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: new Date().toISOString(),
    });
    wiring = getMessagingGroupAgentByPair(mg.id, ag.id);
  }
  if (!wiring) throw new Error(`Failed to wire messaging group ${mg.id} to agent group ${ag.id}`);

  // 5. On-disk filesystem state.
  initGroupFilesystem(ag, {
    instructions:
      `# ${args.agentName}\n\n` +
      `You are ${args.agentName}, a sandbox NanoClaw agent for end-to-end ` +
      `integration testing. Your responses don't reach the real household — ` +
      `this is a test bot. Reply concisely; the human is verifying that the ` +
      `wiring works.`,
  });

  console.log('');
  console.log('Test bot agent wired.');
  console.log(`  agent:        ${ag.name} [${ag.id}] @ groups/${ag.folder}`);
  console.log(`  channel:      ${TEST_BOT_DEFAULTS.channelType} ${mg.platform_id} (is_group=${mg.is_group})`);
  console.log(`  wiring:       ${wiring.id} engage_mode=${wiring.engage_mode} pattern=${wiring.engage_pattern}`);
  console.log('');
  console.log(`Restart the host so the telegram-test adapter starts polling:`);
  console.log(`  launchctl kickstart -k gui/$(id -u)/com.nanoclaw   # macOS`);
  console.log(`  systemctl --user restart nanoclaw                  # Linux`);
  console.log('');
  console.log(`Then DM @<your-test-bot> and confirm BarnabyTest replies.`);
}

main();
