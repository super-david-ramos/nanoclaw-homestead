# Phase 2 — proactive household value

**Goal:** the agent surfaces things the household didn't ask for at the right moments — morning briefing, vault-change notifications.

**Active conventions:** [conventions.md](../conventions.md).

## Tasks (skeleton — task out in detail when starting)

### T-2.1 `[skill + setup]` Morning briefing as a `schedule_task`

Single recurring task in the family agent group, at 06:45 local. Output to a per-user voice note if voice-out is wired (from Phase 1); otherwise text. No new infra — just a scheduled prompt.

TDD pairs:

- Unit tests on the briefing prompt construction (given a date, the output references today's calendar / weather / family items).
- Integration test: the scheduled task fires at the configured time and writes to `outbound.db` for the right messaging group.

### T-2.2 `[code]` fs-watcher equivalent

Scheduled task with a `script` hook that hashes vault state, wakes the agent only when the hash changes. Uses nanoclaw's task `script` mechanism — purpose-built for this pattern (see `groups/main/CLAUDE.md` "Task Scripts" section).

TDD pairs:

- Unit test for the hash function (idempotent, stable across no-change runs).
- Integration test: vault changes → script wakes agent; no changes → script returns `wakeAgent: false`.

### T-2.3 `[skill]` Weekly review report (low-priority Phase 2 add)

Scheduled task targeting the main group, writes to `groups/main/archive/reviews/YYYY-WW.md`.

## Demo (Phase 2 wrap)

Demo path: `tests/demo/phase-2/proactive/`

Demonstrates: synthetic clock advance → morning briefing fires → output appears in family channel; touch a file in `groups/family/` → fs-watcher script returns `wakeAgent: true`.

## Phase 2 done = all of:

- [ ] T-2.1 morning briefing
- [ ] T-2.2 fs-watcher
- [ ] T-2.3 if in scope
- [ ] Demo runs green
- [ ] Completion reports filed
