import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, initTestDb } from '../../../db/connection.js';
import { runMigrations } from '../../../db/migrations/index.js';
import { getUserPrefersVoice, setUserPrefersVoice, upsertUser } from './users.js';

const NOW = '2026-05-01T19:00:00.000Z';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
  upsertUser({
    id: 'telegram:42',
    kind: 'telegram',
    display_name: 'Test User',
    created_at: NOW,
    prefers_voice_replies: 0,
  });
});

afterEach(() => closeDb());

describe('users.prefers_voice_replies', () => {
  it('defaults to false for a freshly upserted user', () => {
    expect(getUserPrefersVoice('telegram:42')).toBe(false);
  });

  it('returns false (not throws) for a non-existent user', () => {
    expect(getUserPrefersVoice('telegram:does-not-exist')).toBe(false);
  });

  it('round-trips: setUserPrefersVoice(true) then getUserPrefersVoice → true', () => {
    setUserPrefersVoice('telegram:42', true);
    expect(getUserPrefersVoice('telegram:42')).toBe(true);
  });

  it('round-trips: setUserPrefersVoice(false) restores the off state', () => {
    setUserPrefersVoice('telegram:42', true);
    setUserPrefersVoice('telegram:42', false);
    expect(getUserPrefersVoice('telegram:42')).toBe(false);
  });
});
