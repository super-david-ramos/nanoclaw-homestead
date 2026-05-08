# Constraints Intel

Synthesized from SPEC sources. Each entry carries source attribution, type (api-contract | schema | nfr | protocol), and the constraint statement.

---

## CON-bun-runtime-host — host runtime is Bun (was Node + pnpm)

- **source:** `docs/plan/phases/phase-bun-migration.md`
- **type:** protocol
- **scope:** host runtime, package manager, test runner, build pipeline
- **constraint:**
  - Host runs Bun (≥ 1.3.13). No Node + pnpm + vitest + tsx + better-sqlite3 in the host package tree post-migration.
  - Live launchd service runs `bun run src/index.ts` via the `Homestead Nanobot.app` bundle wrapper at `~/Applications/`.
  - `package.json` scripts: `test → bun test --isolate`, `dev → bun --watch run src/index.ts`, `start → bun run src/index.ts`. No `tsx` in devDeps. No `dist/` build step.
  - `bunfig.toml` carries supply-chain gate `install.minimumReleaseAge = 259200` (3 days) plus `pathIgnorePatterns = ["container/**"]`.
  - `package.json` `trustedDependencies` mirrors the prior pnpm `onlyBuiltDependencies` allowlist.
  - `.bun-version` file pins Bun version; `engines.bun` matches.
- **status:** Phase complete (2026-05-03 close). Host operational on Bun.

## CON-bun-sqlite-host-mode — host opens DBs with `{ strict: true }`

- **source:** `docs/plan/phases/phase-bun-migration.md` (API delta + Surprises section)
- **type:** api-contract
- **scope:** host SQLite access (`bun:sqlite`)
- **constraint:**
  - Host Database constructors include `{ strict: true }`. This lets bun:sqlite accept bare keys for named params (matching the prior better-sqlite3 default behavior).
  - Host SQL named-params: use `@name` in SQL and bare `name` in JS (e.g., `.run({ id: msg.id })`).
  - Container side does NOT use `strict: true` — different invariant: container uses `$name` in both SQL and JS keys (e.g., `.run({ $id: msg.id })`).
  - Positional `?` params work in both host and container.
- **constraint:**
  - `.get(...)` returns `null` (not `undefined`) when no row matches under bun:sqlite. Host's `T | undefined` getter contract is preserved by appending `?? undefined` at every call site. New getters returning `T | undefined` MUST do the same.

## CON-bun-test-isolate — host tests run with `--isolate`

- **source:** `docs/plan/phases/phase-bun-migration.md` (Surprises section)
- **type:** protocol
- **scope:** host test runner (`bun:test`)
- **constraint:**
  - Host tests run with `bun test --isolate` (each test file in a fresh global). Without `--isolate`, `mock.module` registrations leak across files and tests pass alone, fail together.
  - The natural translation of `vi.mock('m', async () => { const real = await import('m'); ... })` deadlocks under bun:test because the dynamic import inside the mock factory gets caught by the mock itself. Pattern: pre-import the real module statically before the `mock.module` call; ES module hoisting puts the static import first.
  - Imports for tests: `bun:test` (not `vitest`).

## CON-sqlite-pragmas — load-bearing journal modes

- **source:** `docs/plan/phases/phase-bun-migration.md` (T-B.2 Pragma audit)
- **type:** schema
- **scope:** SQLite databases (central + per-session)
- **constraint:**
  - Session DBs (`inbound.db`, `outbound.db`): `journal_mode=DELETE`. Load-bearing for cross-mount visibility (Docker bind mount). Do not change.
  - Central DB (`data/v2.db`): `journal_mode=WAL`.
  - Both: `busy_timeout=5000`, `foreign_keys=ON`.
  - Pragma access pattern under bun:sqlite: `db.run("PRAGMA foo = bar")` (not `db.pragma('foo = bar')`).

## CON-test-trees-separate — host and agent-runner have separate Bun trees

- **source:** `docs/plan/phases/phase-bun-migration.md` (Context + CLAUDE.md gotchas)
- **type:** protocol
- **scope:** package management
- **constraint:**
  - Host: own `package.json` + `bun.lock` + `bunfig.toml` at repo root (with `pathIgnorePatterns = ["container/**"]`).
  - Agent-runner: own `package.json` + `bun.lock` under `container/agent-runner/`. Not part of host's Bun workspace.
  - Adding/bumping a runtime dep in the host: edit root `package.json`, then `bun install` from root. Use `bun install --frozen-lockfile` in CI / automation / container builds.
  - Adding/bumping a runtime dep in `container/agent-runner/`: edit that `package.json`, then `cd container/agent-runner && bun install`. Commit updated `bun.lock`.
  - No `minimumReleaseAge` policy applies to the container tree. Pin agent-runner deps deliberately; never `bun update` blindly.

## CON-installer-bun-fresh-machine — fresh-machine installer must work under Bun

- **source:** `docs/plan/phases/phase-installer-bun.md`
- **type:** protocol
- **scope:** fresh-machine bootstrap chain (`nanoclaw.sh`, `setup.sh`, `setup/install-bun.sh`, `setup/probe.sh`, `setup/auto.ts`, `setup/lib/runner.ts`, `setup/lib/agent-ping.ts`, channel installers)
- **constraint:**
  - `bash nanoclaw.sh` must produce a working install on a fresh machine where Bun is the host runtime.
  - Runtime install: `brew install oven-sh/bun/bun` (macOS) OR `curl -fsSL https://bun.sh/install | bash` (Linux). Drops bun at `~/.bun/bin/bun` on Linux; brew puts it at `/opt/homebrew/bin/bun` on macOS.
  - Package install: `bun install --frozen-lockfile`. Lockfile: `bun.lock` (committed). No `pnpm-lock.yaml`.
  - Version pin: `.bun-version` file + `engines.bun`. Drop `package.json packageManager` field.
  - Native module verify: DROP entirely (bun:sqlite is built-in).
  - TS execution: `bun run setup/index.ts` (drop `tsx`). Bash → TS handoff: `exec bun run --silent setup/auto.ts` (or via `bun run setup:auto` script).
  - Status field rename: `NODE_VERSION` → `BUN_VERSION`. `setup.sh` exit codes: `0` = success, `2` = bun missing, `1` = `bun install --frozen-lockfile` failed.
  - Drop the corepack/npm-prefix-recovery cascade, drop `xcode-select` / `gcc + make` build-tools check, drop the `better-sqlite3` native verify.
  - Drop `setup/install-node.sh` (replaced by `setup/install-bun.sh`).
  - Channel installers (`setup/install-{discord,gchat,github,imessage,linear,matrix,resend,slack,teams,telegram,webex,whatsapp,whatsapp-cloud}.sh`): `pnpm install <pkg>@<version>` → `bun add <pkg>@<version>`.
- **status:** In flight. T-I.1 + T-I.2 + T-I.3 + T-I.4 done (commits 3408170, 8b5a3b0). T-I.5 onward pending.
- **test gate:** `bun run typecheck` clean + `bun test --isolate` 318+/318+ green at every commit.

## CON-supply-chain-bun — minimumReleaseAge gate for new packages

- **source:** `docs/plan/phases/phase-bun-migration.md` + project CLAUDE.md
- **type:** nfr
- **scope:** package resolution
- **constraint:**
  - `bunfig.toml` `install.minimumReleaseAge = 259200` (3 days, expressed in seconds; was pnpm `4320` minutes — same intent).
  - New package versions must exist on the npm registry for 3 days before Bun resolves them.
  - **`minimumReleaseAgeExcludes`** (in `bunfig.toml`): never add entries without explicit human approval; entries must pin exact version (e.g., `package@1.2.3`), never a range.
  - **`trustedDependencies`** (in `package.json`): never add packages without human approval. Postinstall scripts execute arbitrary code during install.
  - `bun install --frozen-lockfile` in CI, automation, container builds. Never bare `bun install` in those contexts.

## CON-rollback-bun-migration — recipe for restoring Node-based service

- **source:** `docs/plan/phases/phase-bun-migration.md` (Rollback recipe)
- **type:** protocol
- **scope:** ops, launchd plist, package tree
- **constraint:** A documented < 2-min rollback exists if anything breaks post-cutover:
  1. `launchctl unload ~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist`
  2. `cp ~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist.pre-bun-backup ~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist`
  3. `git checkout main`
  4. `pnpm install --frozen-lockfile`
  5. `pnpm run build` (rebuild `dist/` — required because the pre-bun plist points at `dist/index.js`, gitignored)
  6. `launchctl load ~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist`
- **prerequisite:** the pre-bun-backup plist must exist at the sibling path. `pnpm-lock.yaml` lives in main's git history (it was tracked there and only deleted on `feat/host-bun-migration`).

## CON-btm-bundle-wrapper — macOS BTM stable-identity bundle wrapper

- **source:** `docs/plan/phases/phase-bun-migration.md` (Post-cutover incident)
- **type:** protocol
- **scope:** macOS launchd integration
- **constraint:**
  - launchd plist `Program` MUST point at the `Homestead Nanobot.app` bundle wrapper at `~/Applications/Homestead Nanobot.app/Contents/MacOS/homestead-nanobot`, which `exec`s `bun`. The bundle's `Info.plist` declares `CFBundleName="Homestead Nanobot"`.
  - This insulates the launch item from BTM (Background Task Management) re-approval whenever the underlying Bun binary's code-signing identity changes.
  - **Future plist `Program` edits to point directly at `bun`** trigger a BTM re-approval prompt. If the user doesn't accept, the next System Settings → Login Items interaction can disable the item via `bootout`. KeepAlive does not respawn a service that's been booted out.
  - Bun upgrades or path changes apply to the wrapper script — DO NOT change the launch item's `Program` away from the bundle wrapper.

## CON-channel-providers-skill-installed — channels and providers ship from sibling branches

- **source:** `docs/plan/01-mental-model.md` + project CLAUDE.md
- **type:** protocol
- **scope:** channel adapters, agent providers
- **constraint:**
  - Trunk does NOT ship any specific channel adapter or non-default agent provider.
  - Channel adapters live on the `channels` branch (Discord, Slack, Telegram, WhatsApp, Teams, Linear, GitHub, iMessage, Webex, Resend, Matrix, Google Chat, WhatsApp Cloud). Installed via `/add-<channel>` skills.
  - Agent providers (non-Claude, e.g., OpenCode) live on the `providers` branch. Installed via `/add-opencode`.
  - Each `/add-<name>` skill is idempotent: `git fetch origin <branch>` → copy module(s) into standard paths → append a self-registration import to the relevant barrel → `bun add <pkg>@<pinned-version>` → build.

## CON-secrets-onecli — secrets live in OneCLI Agent Vault

- **source:** `docs/plan/01-mental-model.md` + project CLAUDE.md
- **type:** protocol
- **scope:** credentials, API keys, OAuth tokens
- **constraint:**
  - Secrets injected into per-agent containers at request time via OneCLI Agent Vault. NOT passed in env vars or chat context.
  - Auto-created agents start in `selective` secret mode. First-time gotcha: `onecli agents set-secret-mode --id <id> --mode all` (or assign specific secret IDs via `onecli agents set-secrets`).
  - Approval-gating credentialed actions is two-sided: server-side (OneCLI gateway, configured via web UI at `http://127.0.0.1:10254`) + host-side (`src/modules/approvals/onecli-approvals.ts` registers a callback via `onecli.configureManualApproval(cb)`).
  - Approver selection: `pickApprover` + `pickApprovalDelivery` from `src/modules/approvals/primitive.ts`. Order: scoped admins for the agent group → global admins → owners. Roles persisted in central DB (`user_roles`); no env var like `NANOCLAW_ADMIN_USER_IDS`.

## CON-cjk-fonts-default-off — agent containers skip CJK fonts by default

- **source:** project CLAUDE.md
- **type:** nfr
- **scope:** agent container image build
- **constraint:**
  - Default agent container image does NOT include CJK fonts (~200 MB saved).
  - Enable via `INSTALL_CJK_FONTS=true` in `.env`, then `./container/build.sh` rebuild + service restart.
  - Without CJK fonts, Chromium-rendered screenshots/PDFs containing CJK text show tofu (empty rectangles).

## CON-two-db-session-split — exactly one writer per session DB file

- **source:** `docs/plan/01-mental-model.md` + project CLAUDE.md
- **type:** schema
- **scope:** session DB files under `data/v2-sessions/<agent_group_id>/<session_id>/`
- **constraint:**
  - Each session has TWO SQLite files: `inbound.db` (host writes, container reads) and `outbound.db` (container writes, host reads).
  - Exactly one writer per file — no cross-mount lock contention.
  - Heartbeat is a `touch` on `/workspace/.heartbeat`, NOT a DB update.
  - Host uses even `seq` numbers; container uses odd.
  - Host ↔ container IO is exclusively these two DB files. No IPC, no pipes, no file watchers between them.
