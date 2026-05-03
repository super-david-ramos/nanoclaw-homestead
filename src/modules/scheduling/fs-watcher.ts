/**
 * Phase 2 T-2.2 — install the recurring fs-watcher task.
 *
 * Mirrors morning-briefing.ts (T-2.1): stable series_id makes the setup script
 * idempotent; first call inserts, repeats are no-ops; pause is preserved.
 *
 * The key difference is the `script` body. Daily briefings need fresh
 * judgment every fire, so they have no script. The fs-watcher *must* have
 * one — a recurring 15-minute task without a wakeAgent gate would burn an
 * agent invocation every 15 minutes regardless of state, defeating the
 * whole pattern.
 *
 * Default script body invokes vault-hash.ts (the tested decision function)
 * against the standard iCloud mount and state file:
 *
 *   /workspace/extra/Homestead       ← container.json additionalMount
 *   /workspace/agent/.fs-watcher-state ← under the agent's writable workspace
 *
 * Caller can override via `opts.script` if a different mount is wired.
 */
import { CronExpressionParser } from 'cron-parser';
import type Database from 'better-sqlite3';

import { TIMEZONE } from '../../config.js';
import { insertTask } from './db.js';

export const FS_WATCHER_SERIES_ID = 'task-fs-watcher';

export const DEFAULT_FS_WATCHER_SCRIPT =
  'bun /app/src/scripts/vault-hash-cli.ts /workspace/extra/Homestead /workspace/agent/.fs-watcher-state';

export interface ScheduleFsWatcherOpts {
  prompt: string;
  cron: string;
  script?: string;
  timezone?: string;
  platformId?: string | null;
  channelType?: string | null;
  threadId?: string | null;
}

export interface ScheduleFsWatcherResult {
  taskId: string;
  created: boolean;
}

export function scheduleFsWatcher(inDb: Database.Database, opts: ScheduleFsWatcherOpts): ScheduleFsWatcherResult {
  const existing = inDb
    .prepare(
      "SELECT id FROM messages_in WHERE series_id = ? AND kind = 'task' AND status IN ('pending','paused') ORDER BY seq DESC LIMIT 1",
    )
    .get(FS_WATCHER_SERIES_ID) as { id: string } | undefined;

  if (existing) {
    return { taskId: existing.id, created: false };
  }

  const interval = CronExpressionParser.parse(opts.cron, {
    tz: opts.timezone ?? TIMEZONE,
  });
  const nextRun = interval.next().toDate().toISOString();

  insertTask(inDb, {
    id: FS_WATCHER_SERIES_ID,
    processAfter: nextRun,
    recurrence: opts.cron,
    platformId: opts.platformId ?? null,
    channelType: opts.channelType ?? null,
    threadId: opts.threadId ?? null,
    content: JSON.stringify({
      prompt: opts.prompt,
      script: opts.script ?? DEFAULT_FS_WATCHER_SCRIPT,
    }),
  });

  return { taskId: FS_WATCHER_SERIES_ID, created: true };
}
