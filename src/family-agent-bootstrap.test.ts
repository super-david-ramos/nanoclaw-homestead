import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { closeDb, initTestDb } from './db/connection.js';
import { runMigrations } from './db/migrations/index.js';
import { ensureFamilyAgent, FAMILY_DEFAULTS } from './family-agent-bootstrap.js';

const TELEGRAM_FAMILY_CHAT_ID = '-1001234567890';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

describe('ensureFamilyAgent', () => {
  it('creates agent group, messaging group, and wiring on first call', () => {
    const result = ensureFamilyAgent({ telegramChatId: TELEGRAM_FAMILY_CHAT_ID });

    expect(result.agentGroup.name).toBe('Barnaby');
    expect(result.agentGroup.folder).toBe('family');

    expect(result.messagingGroup.channel_type).toBe('telegram');
    expect(result.messagingGroup.platform_id).toBe(`telegram:${TELEGRAM_FAMILY_CHAT_ID}`);
    expect(result.messagingGroup.is_group).toBe(1);

    expect(result.wiring.agent_group_id).toBe(result.agentGroup.id);
    expect(result.wiring.messaging_group_id).toBe(result.messagingGroup.id);
    expect(result.wiring.engage_mode).toBe('mention');
  });

  it('is idempotent: a second call returns the same IDs and creates no duplicate rows', () => {
    const first = ensureFamilyAgent({ telegramChatId: TELEGRAM_FAMILY_CHAT_ID });
    const second = ensureFamilyAgent({ telegramChatId: TELEGRAM_FAMILY_CHAT_ID });

    expect(second.agentGroup.id).toBe(first.agentGroup.id);
    expect(second.messagingGroup.id).toBe(first.messagingGroup.id);
    expect(second.wiring.id).toBe(first.wiring.id);
  });

  it('honors custom agent name, folder, and engage mode', () => {
    const result = ensureFamilyAgent({
      telegramChatId: TELEGRAM_FAMILY_CHAT_ID,
      agentName: 'Marigold',
      folder: 'household',
      engageMode: 'mention-sticky',
    });

    expect(result.agentGroup.name).toBe('Marigold');
    expect(result.agentGroup.folder).toBe('household');
    expect(result.wiring.engage_mode).toBe('mention-sticky');
  });

  it('exposes Barnaby/family as the documented defaults', () => {
    expect(FAMILY_DEFAULTS.agentName).toBe('Barnaby');
    expect(FAMILY_DEFAULTS.folder).toBe('family');
    expect(FAMILY_DEFAULTS.engageMode).toBe('mention');
  });
});
