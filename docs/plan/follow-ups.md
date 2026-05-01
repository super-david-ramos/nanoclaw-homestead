# Follow-ups

Things to pick up in a future session — not blocking the current phase but worth not dropping. Add a row when you defer work; remove the row when it's done.

| Entry | Origin | Notes |
|---|---|---|
| **Lift `src/router.ts` branch coverage toward 100%** — current baseline (2026-04-30): 18.79% statements / 17.19% branches across `src/`, with `evaluateEngage` getting its first three tests in commit `5f43925` (`a6d9160` is the matching fix). The rest of `router.ts` (sender resolution, channel-request gate, fan-out, agent-shared session reuse) is largely untested. Per the bug-handling workflow, every reported bug starts with "find existing tests" — most of `router.ts` currently fails that step. | session ending 2026-04-30 (engage_pattern silent-fail-open bug) | Could be a recurring routine via `/schedule` to nudge coverage up over time, or a focused single-session sweep. Branch-coverage report is at `coverage/index.html` after `pnpm test:coverage`. |
