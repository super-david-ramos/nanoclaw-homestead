/**
 * Phase 2 T-2.1 — schedule the household's recurring morning briefing.
 *
 * The series_id is a stable string so the setup script is idempotent: a
 * second invocation finds the live row (pending OR paused, original id OR
 * follow-up after handleRecurrence) and returns it untouched. This is the
 * same primitive scheduling.actions uses — we lean on series_id as the
 * idempotency key rather than on the task id, because handleRecurrence
 * spawns a fresh id per occurrence.
 *
 * No pre-task script attached: the briefing inherently needs the agent's
 * judgment every fire, per scheduling.instructions.md §"When NOT to use
 * scripts".
 */
import { CronExpressionParser } from 'cron-parser';
import type Database from 'better-sqlite3';

import { TIMEZONE } from '../../config.js';
import { insertTask } from './db.js';

export const MORNING_BRIEFING_SERIES_ID = 'task-morning-briefing';

export interface ScheduleMorningBriefingOpts {
  prompt: string;
  cron: string;
  timezone?: string;
  platformId?: string | null;
  channelType?: string | null;
  threadId?: string | null;
}

export interface ScheduleMorningBriefingResult {
  taskId: string;
  created: boolean;
}

export function scheduleMorningBriefing(
  inDb: Database.Database,
  opts: ScheduleMorningBriefingOpts,
): ScheduleMorningBriefingResult {
  const existing = inDb
    .prepare(
      "SELECT id FROM messages_in WHERE series_id = ? AND kind = 'task' AND status IN ('pending','paused') ORDER BY seq DESC LIMIT 1",
    )
    .get(MORNING_BRIEFING_SERIES_ID) as { id: string } | undefined;

  if (existing) {
    return { taskId: existing.id, created: false };
  }

  const interval = CronExpressionParser.parse(opts.cron, {
    tz: opts.timezone ?? TIMEZONE,
  });
  const nextRun = interval.next().toDate().toISOString();

  insertTask(inDb, {
    id: MORNING_BRIEFING_SERIES_ID,
    processAfter: nextRun,
    recurrence: opts.cron,
    platformId: opts.platformId ?? null,
    channelType: opts.channelType ?? null,
    threadId: opts.threadId ?? null,
    content: JSON.stringify({ prompt: opts.prompt, script: null }),
  });

  return { taskId: MORNING_BRIEFING_SERIES_ID, created: true };
}
