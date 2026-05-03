# Phase: Host Bun migration

**Goal:** Migrate the host runtime from Node + pnpm to Bun. Host and container then share one runtime, one package manager, one test framework.

**Active conventions:** [conventions.md](../conventions.md).

## Context

Container migrated to Bun upstream in `c5d0ef8` (2026-04-17, 9 days before our fork). This phase finishes the job for the host. Spike findings (session 2026-05-03):

- `bun install` auto-migrates `pnpm-lock.yaml` → `bun.lock` cleanly (294 packages, 7s).
- `bun build src/index.ts` resolves the entire host import graph (316 modules, 95ms) — every chat-sdk, OneCLI, MCP, and adapter import works.
- `bun test` runs ~67% of host vitest tests unmodified (`describe/it/expect/before/afterEach` are API-compat).
- **Hard blocker:** `better-sqlite3` does not work in Bun (issue [oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290), open since 2023, no timeline). Every host DB call site must move to `bun:sqlite`.

**Trade-off accepted:** Permanent runtime divergence from upstream nanoclaw (mitigated by intent-replay updates via `/update-nanoclaw`).

## Inventory (from spike)

- 26 host files import `better-sqlite3` (incl. `src/db/connection.ts`, `src/db/session-db.ts`, all 14 migrations under `src/db/migrations/`, `src/host-sweep.ts`, `src/delivery.ts`, `src/session-manager.ts`, `src/state-sqlite.ts`, scheduling modules, several test files).
- ~72 distinct `@name` named params used in SQL (must convert to `$name` per `bun:sqlite` convention — same change c5d0ef8 made for the container).
- 8 host test files use vitest-specific APIs: 43× `vi.fn`, 16× `vi.mock`, 5× `vi.importActual`, 1× `vi.spyOn`. Files: `host-core.test.ts`, `container-runtime.test.ts`, `delivery.test.ts`, `voice/transcript-attach.test.ts`, `modules/permissions/sender-approval.test.ts`, `modules/permissions/channel-approval.test.ts`, `channels/channel-registry.test.ts`, `channels/telegram-pairing.test.ts`.
- Service runs `/opt/homebrew/bin/node /Users/dr/Code/nanoclaw-homestead/dist/index.js` via `~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist`.
- CI in `.github/workflows/ci.yml` already has `oven-sh/setup-bun@v2`; uses `pnpm exec vitest run` for host tests.

## Tasks

### T-B.1 `[code]` Foundation: bunfig + supply-chain settings

Add `bunfig.toml` with carry-over settings:

```toml
[install]
minimumReleaseAge = 259200            # was pnpm 4320 minutes
minimumReleaseAgeExcludes = []
```

Carry `pnpm-workspace.yaml`'s `onlyBuiltDependencies` into `package.json` `trustedDependencies`. Keep `pnpm-lock.yaml` and `pnpm-workspace.yaml` for now (rollback safety; deleted in T-B.9).

**Verify:** `pnpm install --frozen-lockfile` still works (no breakage of existing path).

### T-B.2 `[code]` DB layer: better-sqlite3 → bun:sqlite

Convert every `import Database from 'better-sqlite3'` → `import { Database } from 'bun:sqlite'`. Convert `@name` named params → `$name` throughout (mechanical, ~72 distinct params). Update `Database` type imports.

Files (in dependency order, smallest blast radius first):

1. `src/db/connection.ts` (foundation — opens DBs, sets pragmas)
2. `src/db/session-db.ts`
3. `src/db/migrations/index.ts` + every migration under `src/db/migrations/*.ts`
4. `src/state-sqlite.ts`
5. `src/host-sweep.ts`, `src/session-manager.ts`, `src/delivery.ts`
6. `src/modules/scheduling/{db,actions,recurrence,morning-briefing,fs-watcher}.ts`
7. Any others surfaced by `grep -rl "from 'better-sqlite3'"`

**Pragma audit:** verify `journal_mode=DELETE` (load-bearing for cross-mount session DBs per `container/agent-runner/src/db/connection.ts` comment block). Verify `busy_timeout` carries.

**TDD:** for each file, run the existing tests under `bun test path/to/file.test.ts` before edit (red — `better-sqlite3` not supported error), edit, re-run (green). Commit per file or logical group.

### T-B.3 `[code]` Test fixture migration

Test files that construct a `Database` directly (or via test helpers like `initTestDb`). Same conversion as T-B.2.

**Verify:** `bun test` shows every previously passing test still green, plus the previously-failing DB tests now pass.

### T-B.4 `[code]` vi → bun:test mock translation

Translate the 8 files with vitest-specific mock APIs:

- `vi.fn()` → `mock(() => ...)` (from `bun:test`)
- `vi.mock('mod', factory)` → `mock.module('mod', factory)`
- `vi.importActual('mod')` → use bun's `mock.module` re-export pattern
- `vi.spyOn(obj, 'method')` → `spyOn(obj, 'method')` (from `bun:test`)

**TDD:** run each file under `bun test` before edit (red), translate, re-run (green).

### T-B.5 `[code]` Test runner switch

- Remove `vitest`, `@vitest/coverage-v8`, `vitest.config.ts`.
- `package.json` scripts: `test` → `bun test`, `test:watch` → `bun test --watch`, `test:coverage` → `bun test --coverage`.
- `dev` → `bun --watch run src/index.ts` (drop `tsx`).
- Other `tsx`-using scripts (setup, chat, auth) → `bun run`.
- Drop `tsx` from devDeps.

**Verify:** full `bun test` passes (333+ tests); `bun run dev` starts the host.

### T-B.6 `[code]` Drop tsc build step

- Drop `build` script.
- Drop tsconfig `outDir` (keep tsconfig for `typecheck` script — still useful for editor and CI).
- Update `start` script: `node dist/index.js` → `bun run src/index.ts`.

**Verify:** `pnpm exec tsc --noEmit` (or `bun x tsc --noEmit`) still typechecks.

### T-B.7 `[code]` Runtime smoke

Manually start `bun run src/index.ts` against an isolated data dir. Verify:

- Host inits, opens central DB, runs migrations, polls inbound, shuts down clean on SIGTERM.
- No bun-runtime compat surprises in the chat-sdk / OneCLI client / MCP server stacks.

Document any surprises in this doc + a follow-up if not blocking.

### T-B.8 `[code]` CI workflow update

`.github/workflows/ci.yml`:

- Drop `pnpm/action-setup`, drop `pnpm install --frozen-lockfile`.
- Add `bun install --frozen-lockfile` at root.
- `pnpm exec vitest run` → `bun test`.
- `pnpm run format:check` → `bun run format:check` (after T-B.5 ensures script works under bun).
- Container test step unchanged.

### T-B.9 `[code]` launchd plist switchover (the user-visible cutover)

Edit `~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist`:

- ProgramArguments: `[/opt/homebrew/bin/bun, run, /Users/dr/Code/nanoclaw-homestead/src/index.ts]`

Restart: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw-v2-0ee3f1ca`.

**Verify:** `logs/nanoclaw.log` shows clean startup, inbound poll runs, no errors. Send a real message through a wired channel (Telegram), confirm round-trip works.

### T-B.10 `[code]` Cleanup + docs

- Delete `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `dist/`.
- Update `CLAUDE.md`: drop "two runtimes" gotchas section; update build/runtime guidance.
- Update `docs/build-and-runtime.md`.
- Update CONTRIBUTING.md if it mentions pnpm.

### T-B.11 `[code]` Demo + completion report

Demo path: `tests/demo/bun-migration/` — start the host on bun against an isolated data dir, send an inbound, observe outbound delivery. Per `conventions.md` template.

## Order rationale

DB surgery (T-B.2/3) first: it's the largest unknown, most test-blocking, and an early failure here ends the migration cheaply. Test runner switch (T-B.4/5) after DB tests are green so we can validate the full suite at once. Service switchover (T-B.9) is the last reversible-but-user-visible step — everything else is safely on the branch by then.

## Rollback

- All work on `feat/host-bun-migration`; main untouched.
- Service switchover (T-B.9) is the only step that touches running state. Revert: restore plist backup + `launchctl kickstart`. Until T-B.10 deletes `dist/`, `node dist/index.js` is a working fallback.
- If T-B.2/3 reveals a non-trivial bun:sqlite incompatibility (e.g., a SQL feature better-sqlite3 supports that bun:sqlite doesn't), abandon the migration on this branch and document the blocker as a follow-up.

## Phase done = all of

- [ ] T-B.1 through T-B.11 (each with TDD where applicable)
- [ ] `bun test` green (full host + container suites)
- [ ] Host running on bun via launchd, ≥1 round-trip message verified
- [ ] No `vitest`, `tsx`, `better-sqlite3`, `pnpm-*` in host package tree
- [ ] CLAUDE.md and docs reflect bun-on-host
- [ ] Completion report filed
