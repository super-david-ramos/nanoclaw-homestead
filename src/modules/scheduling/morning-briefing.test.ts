/**
 * Tests for scheduleMorningBriefing — the idempotent helper that inserts (or
 * finds) the recurring "morning briefing" task in a session's inbound.db.
 *
 * The series_id is a stable string ('task-morning-briefing') so the same
 * setup script can run on any host start without duplicating the row, and
 * the cancel/pause/resume primitives reach the live row via that key.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'bun:test';

import { ensureSchema, openInboundDb } from '../../db/session-db.js';
import { scheduleMorningBriefing, MORNING_BRIEFING_SERIES_ID } from './morning-briefing.js';

const TEST_DIR = '/tmp/nanoclaw-morning-briefing-test';
const DB_PATH = path.join(TEST_DIR, 'inbound.db');

function freshDb() {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  ensureSchema(DB_PATH, 'inbound');
  return openInboundDb(DB_PATH);
}

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
});

describe('scheduleMorningBriefing', () => {
  it('inserts a recurring task at the configured cron with the briefing prompt', () => {
    const db = freshDb();
    const result = scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });

    expect(result.created).toBe(true);
    expect(result.taskId).toBe(MORNING_BRIEFING_SERIES_ID);

    const row = db
      .prepare('SELECT id, series_id, kind, recurrence, status, content FROM messages_in WHERE id = ?')
      .get(MORNING_BRIEFING_SERIES_ID) as {
      id: string;
      series_id: string;
      kind: string;
      recurrence: string;
      status: string;
      content: string;
    };

    expect(row).toBeTruthy();
    expect(row.kind).toBe('task');
    expect(row.recurrence).toBe('45 6 * * *');
    expect(row.status).toBe('pending');
    expect(row.series_id).toBe(MORNING_BRIEFING_SERIES_ID);

    const parsed = JSON.parse(row.content);
    expect(parsed.prompt).toBe('Brief us.');
    // Daily briefings need fresh judgment per scheduling.instructions.md —
    // no pre-task script attached.
    expect(parsed.script).toBeNull();
    db.close();
  });

  it('is idempotent — second call returns the existing task without inserting a duplicate', () => {
    const db = freshDb();
    const first = scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });
    const second = scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.taskId).toBe(first.taskId);

    const count = db
      .prepare("SELECT COUNT(*) AS n FROM messages_in WHERE series_id = ? AND status IN ('pending','paused')")
      .get(MORNING_BRIEFING_SERIES_ID) as { n: number };
    expect(count.n).toBe(1);
    db.close();
  });

  it('treats a paused live row as already-scheduled (does not re-insert)', () => {
    // If the user paused the briefing, init should NOT silently re-create it
    // as a fresh pending row — the user's pause stands.
    const db = freshDb();
    scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });
    db.prepare("UPDATE messages_in SET status = 'paused' WHERE series_id = ?").run(MORNING_BRIEFING_SERIES_ID);

    const second = scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });
    expect(second.created).toBe(false);

    const stillPaused = db
      .prepare('SELECT status FROM messages_in WHERE series_id = ?')
      .get(MORNING_BRIEFING_SERIES_ID) as { status: string };
    expect(stillPaused.status).toBe('paused');
    db.close();
  });

  it('after a completed-and-replaced occurrence, finds the live follow-up via series_id', () => {
    // After handleRecurrence runs, the original row is completed and a
    // follow-up pending row exists with the same series_id but a new id. The
    // setup script must find that follow-up rather than re-inserting.
    const db = freshDb();
    scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });
    db.prepare("UPDATE messages_in SET status = 'completed', recurrence = NULL WHERE id = ?").run(
      MORNING_BRIEFING_SERIES_ID,
    );
    db.prepare(
      `INSERT INTO messages_in (id, seq, timestamp, status, tries, recurrence, kind, content, series_id)
       VALUES ('mb-next', 998, datetime('now'), 'pending', 0, '45 6 * * *', 'task', '{"prompt":"x","script":null}', ?)`,
    ).run(MORNING_BRIEFING_SERIES_ID);

    const second = scheduleMorningBriefing(db, { prompt: 'Brief us.', cron: '45 6 * * *' });
    expect(second.created).toBe(false);
    expect(second.taskId).toBe('mb-next');
    db.close();
  });

  it('processAfter is the cron next-run in the supplied timezone', async () => {
    const { CronExpressionParser } = await import('cron-parser');
    const db = freshDb();

    const before = Date.now();
    scheduleMorningBriefing(db, {
      prompt: 'Brief us.',
      cron: '45 6 * * *',
      timezone: 'America/Los_Angeles',
    });
    const after = Date.now();

    const row = db.prepare('SELECT process_after FROM messages_in WHERE id = ?').get(MORNING_BRIEFING_SERIES_ID) as {
      process_after: string;
    };

    const expected = CronExpressionParser.parse('45 6 * * *', {
      tz: 'America/Los_Angeles',
      currentDate: new Date(before),
    })
      .next()
      .toDate()
      .getTime();
    const expectedUpper = CronExpressionParser.parse('45 6 * * *', {
      tz: 'America/Los_Angeles',
      currentDate: new Date(after),
    })
      .next()
      .toDate()
      .getTime();

    const stored = Date.parse(row.process_after);
    expect(stored).toBeGreaterThanOrEqual(expected);
    expect(stored).toBeLessThanOrEqual(expectedUpper);
    db.close();
  });
});
