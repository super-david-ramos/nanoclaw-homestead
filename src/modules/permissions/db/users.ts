import type { User } from '../../../types.js';
import { getDb } from '../../../db/connection.js';

export function createUser(user: User): void {
  getDb()
    .prepare(
      `INSERT INTO users (id, kind, display_name, created_at)
       VALUES (@id, @kind, @display_name, @created_at)`,
    )
    .run(user);
}

export function upsertUser(user: User): void {
  getDb()
    .prepare(
      `INSERT INTO users (id, kind, display_name, created_at)
       VALUES (@id, @kind, @display_name, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, users.display_name)`,
    )
    .run(user);
}

export function getUser(id: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined ?? undefined;
}

export function getAllUsers(): User[] {
  return getDb().prepare('SELECT * FROM users ORDER BY created_at').all() as User[];
}

export function updateDisplayName(id: string, displayName: string): void {
  getDb().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, id);
}

export function deleteUser(id: string): void {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}

/**
 * Read the per-user voice-reply preference. Returns false for unknown
 * users and for users where the column was never set — the default state
 * is "no voice replies" so a brand-new install never surprises someone with
 * an audio response.
 */
export function getUserPrefersVoice(id: string): boolean {
  const row = getDb().prepare('SELECT prefers_voice_replies FROM users WHERE id = ?').get(id) as
    | { prefers_voice_replies: number }
    | undefined ?? undefined;
  return row?.prefers_voice_replies === 1;
}

export function setUserPrefersVoice(id: string, prefers: boolean): void {
  getDb()
    .prepare('UPDATE users SET prefers_voice_replies = ? WHERE id = ?')
    .run(prefers ? 1 : 0, id);
}
