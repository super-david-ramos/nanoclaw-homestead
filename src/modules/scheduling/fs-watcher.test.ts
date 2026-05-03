/**
 * Tests for scheduleFsWatcher — the idempotent helper that installs the
 * recurring fs-watcher task. Mirrors morning-briefing.test.ts in shape; the
 * difference is this task carries a `script` body (the vault-hash.ts gate)
 * that suppresses the wake when nothing has changed.
 *
 * The series_id is stable ('task-fs-watcher') so the setup script is
 * re-runnable safely and pause/resume reach the live row through the same
 * primitive the morning briefing uses.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';

import { ensureSchema, openInboundDb } from '../../db/session-db.js';
import { scheduleFsWatcher, FS_WATCHER_SERIES_ID, DEFAULT_FS_WATCHER_SCRIPT } from './fs-watcher.js';

const TEST_DIR = '/tmp/nanoclaw-fs-watcher-test';
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

describe('scheduleFsWatcher', () => {
  it('inserts a recurring task with the wake-on-change prompt and the vault-hash script body', () => {
    const db = freshDb();
    const result = scheduleFsWatcher(db, {
      prompt: 'Vault changed — investigate.',
      cron: '*/15 * * * *',
    });

    expect(result.created).toBe(true);
    expect(result.taskId).toBe(FS_WATCHER_SERIES_ID);

    const row = db
      .prepare('SELECT id, series_id, kind, recurrence, status, content FROM messages_in WHERE id = ?')
      .get(FS_WATCHER_SERIES_ID) as {
      id: string;
      series_id: string;
      kind: string;
      recurrence: string;
      status: string;
      content: string;
    };

    expect(row).toBeTruthy();
    expect(row.kind).toBe('task');
    expect(row.recurrence).toBe('*/15 * * * *');
    expect(row.status).toBe('pending');
    expect(row.series_id).toBe(FS_WATCHER_SERIES_ID);

    const parsed = JSON.parse(row.content);
    expect(parsed.prompt).toBe('Vault changed — investigate.');
    // The script body MUST be present and non-empty — without it the task
    // wakes the agent every 15 minutes regardless of vault state, and that
    // defeats the whole point of the fs-watcher pattern.
    expect(typeof parsed.script).toBe('string');
    expect(parsed.script.length).toBeGreaterThan(0);
    // The default body invokes the vault-hash CLI through bun.
    expect(parsed.script).toMatch(/vault-hash(-cli)?\.ts/);
    db.close();
  });

  it('is idempotent — second call returns the existing task without inserting a duplicate', () => {
    const db = freshDb();
    const first = scheduleFsWatcher(db, { prompt: 'p', cron: '*/15 * * * *' });
    const second = scheduleFsWatcher(db, { prompt: 'p', cron: '*/15 * * * *' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.taskId).toBe(first.taskId);

    const count = db
      .prepare("SELECT COUNT(*) AS n FROM messages_in WHERE series_id = ? AND status IN ('pending','paused')")
      .get(FS_WATCHER_SERIES_ID) as { n: number };
    expect(count.n).toBe(1);
    db.close();
  });

  it('treats a paused live row as already-scheduled (does not re-insert)', () => {
    const db = freshDb();
    scheduleFsWatcher(db, { prompt: 'p', cron: '*/15 * * * *' });
    db.prepare("UPDATE messages_in SET status = 'paused' WHERE series_id = ?").run(FS_WATCHER_SERIES_ID);

    const second = scheduleFsWatcher(db, { prompt: 'p', cron: '*/15 * * * *' });
    expect(second.created).toBe(false);

    const stillPaused = db.prepare('SELECT status FROM messages_in WHERE series_id = ?').get(FS_WATCHER_SERIES_ID) as {
      status: string;
    };
    expect(stillPaused.status).toBe('paused');
    db.close();
  });

  it('accepts a custom script body — useful if the user wants to point at a different mount path', () => {
    const db = freshDb();
    const result = scheduleFsWatcher(db, {
      prompt: 'p',
      cron: '*/15 * * * *',
      script: 'echo \'{"wakeAgent":false}\'',
    });

    expect(result.created).toBe(true);
    const row = db.prepare('SELECT content FROM messages_in WHERE id = ?').get(FS_WATCHER_SERIES_ID) as {
      content: string;
    };
    const parsed = JSON.parse(row.content);
    expect(parsed.script).toBe('echo \'{"wakeAgent":false}\'');
    db.close();
  });

  it('default script body references the standard mount and state paths', () => {
    expect(DEFAULT_FS_WATCHER_SCRIPT).toContain('/workspace/extra/Homestead');
    expect(DEFAULT_FS_WATCHER_SCRIPT).toContain('/workspace/agent/.fs-watcher-state');
    expect(DEFAULT_FS_WATCHER_SCRIPT).toMatch(/vault-hash(-cli)?\.ts/);
  });

  it('processAfter is the cron next-run in the supplied timezone', async () => {
    const { CronExpressionParser } = await import('cron-parser');
    const db = freshDb();

    const before = Date.now();
    scheduleFsWatcher(db, { prompt: 'p', cron: '*/15 * * * *', timezone: 'UTC' });
    const after = Date.now();

    const row = db.prepare('SELECT process_after FROM messages_in WHERE id = ?').get(FS_WATCHER_SERIES_ID) as {
      process_after: string;
    };

    const expected = CronExpressionParser.parse('*/15 * * * *', { tz: 'UTC', currentDate: new Date(before) })
      .next()
      .toDate()
      .getTime();
    const expectedUpper = CronExpressionParser.parse('*/15 * * * *', { tz: 'UTC', currentDate: new Date(after) })
      .next()
      .toDate()
      .getTime();

    const stored = Date.parse(row.process_after);
    expect(stored).toBeGreaterThanOrEqual(expected);
    expect(stored).toBeLessThanOrEqual(expectedUpper);
    db.close();
  });
});
