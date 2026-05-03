# Build & Runtime

NanoClaw runs on **Bun** end-to-end: the host is Bun, the agent container is Bun. They communicate exclusively through two SQLite files per session — there are no shared modules between them, which is what lets them be independently versioned package trees.

## Two Bun trees

```
/                             Bun 1.3.13+
  bun.lock                    host deps (channels, Chat SDK, Baileys, etc.)
  bunfig.toml                 install.minimumReleaseAge + [test] config
  package.json                trustedDependencies allowlist + scripts

/container/agent-runner/      Bun 1.3.12+
  bun.lock                    agent-runner runtime deps (Claude Agent SDK, MCP SDK, zod, etc.)
  package.json                @types/bun, typescript devDeps for type-checking
```

The two trees are independent — `bun install` at the root does not touch `container/agent-runner/`, and vice versa. The host's `bunfig.toml` has `[test] pathIgnorePatterns = ["container/**"]` so `bun test` from root never tries to load container source.

The container image also has pnpm + Node inside for global CLIs (`@anthropic-ai/claude-code`, `agent-browser`, `vercel`). Those are Node binaries the agent invokes at runtime, not library deps. Keeping them on pnpm preserves the supply-chain policy for CLI versions inside the image.

## Migration history

The host migrated from Node + pnpm + vitest + tsx to Bun + bun:test in [docs/plan/phases/phase-bun-migration.md](plan/phases/phase-bun-migration.md). Container had moved earlier (upstream commit `c5d0ef8`, 2026-04-17). The host migration unblocks: a single runtime + package manager + test runner + lockfile across both trees, faster startup (no tsc build step), bun:sqlite parity with the container side. The accepted cost was permanent runtime divergence from upstream `qwibitai/nanoclaw` (mitigated by `/update-nanoclaw`'s intent-replay update workflow).

## Lockfiles

| Tree | Lockfile | Manager | Regenerate after dep change |
|------|----------|---------|----------------------------|
| Host | `bun.lock` (root) | Bun 1.3.13+ | `bun install` |
| Agent-runner | `container/agent-runner/bun.lock` | Bun 1.3.12+ | `cd container/agent-runner && bun install` |

Both committed. CI and the Dockerfile run `--frozen-lockfile` variants — any drift between `package.json` and lockfile fails the build.

## Supply chain

- **Host** (Bun): `install.minimumReleaseAge = 259200` (3-day hold on new versions) in `bunfig.toml`, `trustedDependencies` allowlist in `package.json` (postinstall script gate). The migration carried the same intent and gate from the prior pnpm `minimumReleaseAge: 4320` minutes / `onlyBuiltDependencies` arrangement. See `bunfig.toml`, `package.json`, and `docs/SECURITY.md`.
- **Agent-runner** (Bun): no release-age policy — Bun's `bunfig.toml` config supports it, but the container tree has not been brought under the gate yet (open follow-up). The defenses today are `bun.lock` pinning plus version-pinned CLIs/Bun itself via Dockerfile ARGs. When bumping `@anthropic-ai/claude-agent-sdk` or any runtime dep, review the release date on npm and bump deliberately, not via `bun update`.
- **Container global CLIs** (pnpm inside image): `agent-browser`, `@anthropic-ai/claude-code`, `vercel` are pinned via `ARG` in the Dockerfile and installed via pnpm in the image build. `bun install -g` would bypass the in-image pnpm policy.

## Image build surface

`container/Dockerfile` is a single-stage build on `node:22-slim`:

- **Pinned ARGs** — `BUN_VERSION`, `CLAUDE_CODE_VERSION`, `AGENT_BROWSER_VERSION`, `VERCEL_VERSION`. Bump deliberately in PRs.
- **CJK fonts** — `ARG INSTALL_CJK_FONTS=false`. `container/build.sh` reads `INSTALL_CJK_FONTS` from `.env` and passes it through. Default build saves ~200MB; opt in when the user works with Chinese/Japanese/Korean content.
- **BuildKit cache mounts** — `/var/cache/apt`, `/var/lib/apt`, `/root/.bun/install/cache`, `/root/.cache/pnpm`. Rebuilds where `package.json`/`bun.lock` haven't changed are fast. Requires BuildKit (default on Docker 23+, Apple Container-compat).
- **`tini` as init** — reaps Chromium zombies, forwards signals so in-flight `outbound.db` writes finalize on SIGTERM.
- **`entrypoint.sh`** (extracted) — `exec bun run /app/src/index.ts` under tini. Readable and diffable.
- **No compiled `/app/dist`** — Bun runs TS directly. The host also mounts fresh source over `/app/src` at session start, so host edits take effect without rebuilding the image.

## Session wake (two paths)

1. **Base image ENTRYPOINT** — used for stdin-piped test invocations like the sample in `container/build.sh`: `tini --> entrypoint.sh` captures stdin to `/tmp/input.json`, then `exec bun run src/index.ts`.
2. **Host-spawned session** — `src/container-runner.ts` at line ~301 uses `--entrypoint bash` with `-c 'exec bun run /app/src/index.ts'`. Bypasses tini (Docker's default PID 1 handling applies). Stdin is unused; all IO flows through the mounted session DBs.

Both paths end with Bun running the same source file from `/app/src/index.ts`.

## Host runtime

The host is started by launchd (macOS) or systemd (Linux) with:

```
/opt/homebrew/bin/bun run /Users/dr/Code/nanoclaw-homestead/src/index.ts
```

(macOS plist at `~/Library/LaunchAgents/com.nanoclaw-v2-<slug>.plist`.) Bun runs `src/index.ts` directly — no build step, no `dist/`. `bun run dev` provides a hot-reload variant for interactive development.

## CI shape

`.github/workflows/ci.yml` installs Bun once (no Node, no pnpm), then runs in order:

1. `bun install --frozen-lockfile` at root (host)
2. `bun install --frozen-lockfile` in `container/agent-runner/` (container)
3. `bun run format:check`
4. `bun run typecheck` (host: `tsc --noEmit`)
5. `bunx tsc -p container/agent-runner/tsconfig.json --noEmit` (container typecheck)
6. `bun test --isolate` at root (host tests)
7. `bun test` in `container/agent-runner/` (container tests)

Any failure fails the PR.

## Key invariants

- **Session DBs must use `journal_mode=DELETE`.** WAL's `-shm` memory-map doesn't cross VirtioFS between host and guest. See the doc comment at the top of `container/agent-runner/src/db/connection.ts` and `src/db/session-db.ts`.
- **Host `Database` constructors use `{ strict: true }`.** This makes bun:sqlite accept bare object keys (`{ name: 'x' }`) for `@name` SQL params, matching the prior better-sqlite3 default behavior. Without strict mode, bun:sqlite requires the prefix in JS keys.
- **Container `Database` constructors do NOT use strict mode.** Container-side code uses `$name` in both SQL and JS keys (`.run({ $id: msg.id })`) — that's the bun:sqlite default. Don't paper-over the difference; the two ends were established independently.
- **Host `.get(...)` getters that declare `T | undefined` must coerce.** bun:sqlite's `.get(...)` returns `null` (not `undefined`) when no row matches. Append `?? undefined` at the call site to preserve the API contract — this is mechanical but easy to forget when adding new getters.
- **Host tests must run with `--isolate`.** `bun:test`'s `mock.module` registrations are process-global by default; `--isolate` gives each test file a fresh global. Without it, tests pass alone and fail together. The `package.json` `test` script bakes `--isolate` in.
- **No tsc build step anywhere.** Both host and container run TypeScript directly via Bun. Re-adding a build step on either side would reintroduce build-time + cold-start cost.
- **Global container CLIs stay on pnpm inside the image.** `agent-browser`, `@anthropic-ai/claude-code`, `vercel` and any future Node CLIs the agent invokes should be pinned versions under the Dockerfile's pnpm global-install block. `bun install -g` would bypass the in-image pnpm supply-chain policy.
