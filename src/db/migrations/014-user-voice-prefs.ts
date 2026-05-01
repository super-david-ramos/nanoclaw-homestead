/**
 * Add per-user voice preference. When the flag is set, delivery synthesizes
 * a voice reply for outbound messages directed at this user.
 *
 * Decision rationale: docs/plan/decisions/03-voice.md (Resolved 2026-05-01).
 * Picked a SQL column over the lazier "facts in groups/global/CLAUDE.md"
 * option because the delivery layer needs to make the TTS-or-not decision
 * in the hot path, not by waking an LLM read.
 */
import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration014: Migration = {
  version: 14,
  name: 'user-voice-prefs',
  up(db: Database.Database) {
    db.exec(`ALTER TABLE users ADD COLUMN prefers_voice_replies INTEGER NOT NULL DEFAULT 0`);
  },
};
