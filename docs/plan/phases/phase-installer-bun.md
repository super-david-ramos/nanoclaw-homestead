# Phase: Installer rewrite for Bun

**Goal:** Make `bash nanoclaw.sh` produce a working install on a fresh machine where Bun is the host runtime. Today the installer chain still installs Node + pnpm + builds `dist/`, all of which the bun-migration phase ([phase-bun-migration.md](phase-bun-migration.md)) removed.

**Active conventions:** [conventions.md](../conventions.md). Live service unaffected (already running on Bun via the Homestead Nanobot bundle); this phase only touches install-time + first-run paths.

## Context

`feat/host-bun-migration` made the host Bun-native end-to-end for the AUTHOR's already-set-up laptop. The fresh-machine path is broken:

- `nanoclaw.sh` line 6: comments say "install the basics (Node + pnpm + native modules)".
- `nanoclaw.sh` line 262: `exec pnpm --silent run setup:auto`.
- `setup.sh` (247 lines): detects Node, installs pnpm via corepack/npm, runs `pnpm install --frozen-lockfile`, verifies `better-sqlite3`, emits `NODE_VERSION` / `DEPS_OK` / `NATIVE_OK` status fields.
- `setup/install-node.sh`: brew/apt installs Node 22.
- `setup/probe.sh`: probes Node version + `node_modules/better-sqlite3/build/Release/better_sqlite3.node`.
- `setup/auto.ts`, `setup/lib/runner.ts`, `setup/lib/agent-ping.ts`: spawn `pnpm` and `tsx` subprocesses, surface `pnpm run chat` strings to users.
- `setup/install-*.sh` channel installers: `pnpm install <pkg>@<version>`.

**The user's Mac Mini deployment is the forcing function** — they will `git clone` and `bash nanoclaw.sh` on a fresh machine and expect it to land a running service.

**Trade-off accepted:** Same fork-vs-upstream divergence as [phase-bun-migration.md](phase-bun-migration.md). This phase widens that divergence into the install path. `/update-nanoclaw`'s intent-replay model carries it forward.

## Inventory (from grep on 2026-05-06)

Files that mention `pnpm` / `tsx` / `node`-as-runtime / `NODE_VERSION` / `node_modules` and need updates:

**Bash bootstrap chain (3 files, the critical path):**
- `nanoclaw.sh` (262 lines) — entry point, comments + bootstrap call + setup:auto handoff
- `setup.sh` (247 lines) — detects + installs the runtime, runs `pnpm install`, verifies native module
- `setup/install-node.sh` (54 lines) — runtime-installer helper

**Probe (1 file, runs BEFORE bun exists):**
- `setup/probe.sh` (254 lines) — `BEFORE setup.sh has installed Node, pnpm, and node_modules` comment + `node_modules/better-sqlite3/.../better_sqlite3.node` check

**TS-side runners (3 files):**
- `setup/auto.ts` — `pnpm run setup:auto`, `pnpm run chat`, `pnpm exec tsx scripts/...` strings + spawn calls
- `setup/lib/runner.ts` — `pnpm exec tsx setup/index.ts --step ...` + `pnpm --silent run setup:auto` spawns
- `setup/lib/agent-ping.ts` — `spawn('pnpm', ['run', 'chat', 'ping'], ...)`

**Channel installers (`/add-X` flows, ~7 files):**
- `setup/install-{discord,gchat,github,imessage,linear,matrix,resend,slack,teams,telegram,webex,whatsapp,whatsapp-cloud}.sh` — each does `pnpm install <pkg>@<pinned-version>` after copying skill files. Lower priority than the bootstrap chain (only runs when user invokes `/add-<channel>`), but the change is identical: `pnpm install <pkg>` → `bun add <pkg>`. Hold these for a follow-on commit if the bootstrap path takes long enough.

**Other (likely cosmetic):**
- `setup/{container,cli-agent,set-env,index,logs}.ts` — grep matches; need to verify whether they're real `pnpm`/`tsx` invocations or just user-facing strings.

## API delta: Node + pnpm → Bun

| Concept | Current (Node + pnpm) | New (Bun) |
|---|---|---|
| Runtime install | `brew install node@22` / nodesource apt | `brew install oven-sh/bun/bun` / `curl -fsSL https://bun.sh/install \| bash` |
| Package install | `pnpm install --frozen-lockfile` | `bun install --frozen-lockfile` |
| Lockfile | `pnpm-lock.yaml` (gone) | `bun.lock` (committed) |
| Version pin | `package.json` `packageManager: "pnpm@…"` | `.bun-version` file + `engines.bun` (already in place) |
| Native module verify | `node -e "require('better-sqlite3')"` | **Drop entirely** — bun:sqlite is built-in |
| TS execution | `tsx setup/index.ts` | `bun run setup/index.ts` |
| Bash → TS handoff | `exec pnpm --silent run setup:auto` | `exec bun run --silent setup/auto.ts` (or new `bun run setup:auto` script) |
| Status field | `NODE_VERSION: 22.x` | `BUN_VERSION: 1.3.x` |
| corepack/npm fallback chain | ~80 lines in `install_deps()` | **Drop** — Bun is one static binary, no shim cascade |
| Build tools check | `xcode-select -p` / `gcc + make` | **Drop** — no native modules to compile |
| `LSDisplayInfo` BTM gotcha | n/a (was already plist-based) | Bundle wrapper handles it (already shipped via T-B.8 + `setup/service.ts` `b090c0c`) |

## Tasks

### T-I.1 `[code]` Add `setup/install-bun.sh`

Sister to `setup/install-node.sh`. Idempotent. Pure bash (runs BEFORE Bun exists).

- macOS: `brew install oven-sh/bun/bun` (Homebrew's offical bun tap; we already use it on the laptop). Fail with a clear message if `brew` is missing — `nanoclaw.sh` already pre-flights brew so this should never fire.
- Linux: `curl -fsSL https://bun.sh/install | bash`. The official installer drops bun at `~/.bun/bin/bun`. Append to PATH for the current shell so `command -v bun` resolves immediately.
- Verify: `command -v bun && bun --version` succeeds + version satisfies `>=1.3.13` (matches `package.json` `engines.bun`). Status block emits `BUN_VERSION` field for `setup.sh` to grep_field.

**Test:** scratch-dir smoke — `bash setup/install-bun.sh` in a `/tmp/nanoclaw-installer-test/` clone where Bun is uninstalled (or `PATH` artificially excludes it). Don't actually uninstall the laptop's bun.

### T-I.2 `[code]` Rewrite `setup.sh` for Bun

Replace `check_node` / `install_deps` with `check_bun` / `bun install`. Drop `check_build_tools`, drop the corepack/npm-prefix-recovery cascade, drop the `better-sqlite3` native verify. Status block replaces `NODE_VERSION`/`DEPS_OK`/`NATIVE_OK` with `BUN_VERSION`/`DEPS_OK`. Exit codes:

- `0` = success
- `2` = bun missing (was `node_missing`)
- `1` = `bun install --frozen-lockfile` failed

Net line count drops substantially — most of the 247 lines are pnpm-shim recovery cascade + native module verify + corepack handling, all gone.

### T-I.3 `[code]` Update `nanoclaw.sh`

Three spots:
- Comments lines 6-9: "Node + pnpm + native modules" → "Bun + dependencies"
- The pre-flight at line 252 that prepends `npm prefix bin` to PATH for pnpm — drop entirely; bun installs to a fixed location (`~/.bun/bin` on Linux, `/opt/homebrew/bin` on macOS via brew)
- Hand-off line 262: `exec pnpm --silent run setup:auto` → `exec bun run --silent setup/auto.ts` (or use the existing `package.json` `setup:auto` script — it already says `bun run setup/auto.ts` post-T-B.5)

The bash-side bootstrap entry (`write_bootstrap_entry`) currently grep_fields `NODE_VERSION`. Switch to `BUN_VERSION` to match the new `setup.sh` status block.

### T-I.4 `[code]` Update `setup/probe.sh`

- Comment line 7: "BEFORE setup.sh has installed Node, pnpm, and node_modules" → "BEFORE setup.sh has installed Bun and dependencies"
- The `node_modules/better-sqlite3/...` check is now nonsensical (no native module). Replace with a presence check on `bun.lock` + `node_modules/.bin/bun-types` (the only native-ish package we depend on at install time, and bun can run `node_modules/` without it being there).

Actually simplest: replace the native-module gate with a `bun install --dry-run` exit code check. Probes whether deps are resolvable without actually mutating state.

### T-I.5 `[code]` Update TS-side runners

`setup/lib/runner.ts`: `pnpm exec tsx setup/index.ts --step` → `bun run setup/index.ts --step`. `pnpm --silent run setup:auto` → `bun run --silent setup:auto`.

`setup/lib/agent-ping.ts`: `spawn('pnpm', ['run', 'chat', 'ping'])` → `spawn('bun', ['run', 'chat', 'ping'])`.

`setup/auto.ts`: replace ~10 user-facing "run `pnpm run chat hi`" strings with "run `bun run chat hi`". Replace `spawnSync('sg', ['docker', '-c', 'pnpm run setup:auto'])` (line 948) with the bun equivalent.

### T-I.6 `[code]` Drop `setup/install-node.sh`

After `setup.sh` no longer references it: `git rm setup/install-node.sh`. The bun helper (T-I.1) replaces it. Dropping rather than renaming because the file ships in the public install surface and a confusingly-named leftover would invite mistakes.

### T-I.7 `[code]` Drop `package.json packageManager` field

Currently `"packageManager": "pnpm@10.33.0"`. Bun has no equivalent semantics. We already have `.bun-version` + `engines.bun`. Drop the field cleanly.

### T-I.8 `[code]` Channel installers (`setup/install-{discord,...}.sh`)

Mechanical sweep: every `pnpm install <pkg>@<version>` becomes `bun add <pkg>@<version>`. ~13 files. Each is a couple of lines. Bundle into one commit unless any one of them needs special handling beyond the package-manager swap.

These don't run during the bootstrap path — only when the user invokes `/add-<channel>` later — so the laptop won't break if I delay this. Mac Mini deployment will need it for any channel beyond Telegram (which is already installed at the source level).

### T-I.9 `[code]` Demo: scratch-dir fresh install

`tests/demo/installer-bun/run.sh`. Inspection-only — does NOT actually install bun on the host (laptop already has it). Verifies:

1. `nanoclaw.sh`, `setup.sh`, `setup/install-bun.sh`, `setup/probe.sh` exist + are executable + have a `#!/usr/bin/env bash` or `#!/bin/bash` shebang
2. None of the four reference `pnpm`, `tsx`, `node_modules/better-sqlite3`, or `dist/index.js`
3. `package.json` has no `packageManager` field, has `engines.bun`, has `.bun-version` matching `engines.bun`
4. `setup/install-node.sh` does NOT exist (deleted in T-I.6)
5. `bun run --silent setup:auto -- --help` (or equivalent dry-run) starts without erroring

Section 5 is the only one that actually executes anything; the other four are file-presence + grep checks.

### T-I.10 `[code]` Completion report + follow-up cleanup

Append to this doc, mark T-I.1 through T-I.9 done, file the completion report. Remove the `nanoclaw.sh installer` row from `follow-ups.md` (this phase closes it). Update the resume pointer in `follow-ups.md` to reflect the new state.

## Order rationale

T-I.1 + T-I.2 + T-I.3 are the critical path — they make `bash nanoclaw.sh` work end-to-end. Do them first, in one commit, so the bootstrap chain stays internally consistent. T-I.4 (probe) follows because probe runs alongside the bootstrap. T-I.5 (TS runners) is mechanical and safe once T-I.3 has updated the hand-off. T-I.6 + T-I.7 are cleanup. T-I.8 (channel installers) is a separable batch — defer if the bootstrap path takes long.

## Risk + rollback

**Risk profile:** Lower than [phase-bun-migration.md](phase-bun-migration.md). The live service is unaffected — these scripts only run on `bash nanoclaw.sh` invocations, which the laptop install never does post-setup. Mac Mini deployment is the only consumer.

**Rollback:** `git checkout main -- nanoclaw.sh setup.sh setup/install-node.sh setup/probe.sh setup/auto.ts setup/lib/runner.ts setup/lib/agent-ping.ts setup/install-*.sh package.json`. Restores the pnpm-based installer. Won't actually work end-to-end on `feat/host-bun-migration` (lockfile is bun.lock; the restored installer expects pnpm-lock.yaml) — so rollback is "abandon this phase entirely on the branch", not "revert just one commit." Acceptable because the phase is self-contained.

**Test gate:** `bun run typecheck` clean + `bun test --isolate` 318+/318+ green at every commit. This phase mostly touches `.sh` and one-line TS edits; a full bash test pass would require a clean VM, which is impractical. The smoke demo (T-I.9) is the proxy.

## Demo

Path: `tests/demo/installer-bun/run.sh` (built in T-I.9). Inspection-only.

Manual validation (deferred until Mac Mini deployment): clone the repo on a fresh Mac Mini with `brew` already installed, run `bash nanoclaw.sh`, observe a working install. Add the report to this phase doc afterward.

## Phase done = all of

- [ ] T-I.1 through T-I.10
- [ ] `bun run typecheck` clean, `bun test --isolate` green at every commit
- [ ] No remaining `pnpm`/`tsx`/`NODE_VERSION`/`better-sqlite3` references in the bootstrap chain (`nanoclaw.sh`, `setup.sh`, `setup/install-bun.sh`, `setup/probe.sh`)
- [ ] No remaining `pnpm` spawns in `setup/auto.ts` / `setup/lib/runner.ts` / `setup/lib/agent-ping.ts`
- [ ] Demo runs green on the laptop (file-presence + grep + `bun run --silent setup:auto --help`)
- [ ] `follow-ups.md` row for the installer rewrite removed; resume pointer updated
- [ ] Completion report filed in this doc's "Reports" section
