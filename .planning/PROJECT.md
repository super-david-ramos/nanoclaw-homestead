# nanoclaw-homestead

## What This Is

A fork of `qwibitai/nanoclaw` v2 layered with multi-user household-agent capabilities ported from `super-david-ramos/homestead-ts`. The household uses chat channels (Telegram, iMessage, etc.), supports voice in/out on every channel, persists memory in markdown the household browses via Obsidian, and runs on a Mac Mini M2 (8 GB RAM). Built inside nanoclaw v2's mental model — keep homestead's user-visible value, drop the infra nanoclaw already covers.

## Core Value

Daily-use household reliability — the household uses the agent daily across Telegram + iMessage + voice with zero unrecovered failures over a 30-day window.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Phase 0 foundations + Bun migration + voice + proactive briefing all live. -->

- ✓ **REQ-phase0-setup-host** — `/setup` flow produces working host + container + OneCLI (Phase 0)
- ✓ **REQ-phase0-upstream-remote** — `upstream` git remote → `qwibitai/nanoclaw` (no-pushing) (Phase 0)
- ✓ **REQ-phase0-telegram-channel** — Telegram inbound→`messages_in`→agent reply roundtrip (Phase 0)
- ✓ **REQ-phase0-role-resolver-skill** — `container/skills/role-resolver/SKILL.md` shipped + structural tests (Phase 0)
- ✓ **REQ-phase0-auto-skill-save-skill** — `container/skills/auto-skill-save/SKILL.md` shipped + structural tests (Phase 0)
- ✓ **REQ-phase0-family-bootstrap** — `family` agent group registered + PARA + skills scaffolding + DB wiring (Phase 0)
- ✓ **REQ-phase0-obsidian-vault** — Obsidian renders household memory via selective iCloud symlinks (Phase 0)
- ✓ **REQ-phase0-demo** — `tests/demo/phase-0/family-roundtrip/` runs green (Phase 0)
- ✓ **REQ-bun-host-migration** — host runtime Node+pnpm → Bun; `bun:test --isolate` 318+ tests green (Phase Bun-Migration)
- ✓ **REQ-voice-everywhere** — STT (Whisper) + TTS (`say`+ffmpeg) wraps every text channel; medium-match reply rule (Phase 1)
- ✓ **REQ-morning-briefing** — `scheduleMorningBriefing` 06:45 cron, idempotent series_id (Phase 2)
- ✓ **REQ-fs-watcher** — `scheduleFsWatcher` `*/15 * * * *` over iCloud Obsidian vault, content-diff wake (Phase 2)

### Active

<!-- Current scope. Building toward these. Active phase: phase-installer-bun. -->

- [ ] **REQ-installer-bun-fresh-machine** — `bash nanoclaw.sh` produces a working install on a fresh Mac with Bun as host runtime (T-I.5+: TS runners, drop install-node.sh, drop packageManager, channel installer sweep, demo, completion report)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **OPA / Rego policy engine** — nanoclaw primitives (`user_roles`, OneCLI secret modes, `pending_approvals`, `unknown_sender_policy`) sufficient for adult-only household. Reintroduce when Owen/child role lands or external comms exit local-only mode (decisions/02-policy-opa.md).
- **Pool-aware substitution + Max OAuth runtime** — no evidence cost is the bottleneck pre-shipping. Stay on Claude Agent SDK + OneCLI. Reintroduce when daily spend > $X sustained or Max sub becomes worth optimizing for (decisions/04-no-pool-no-max.md, LOCKED).
- **pi-agent-core / Claude Code CLI runtime adapter** — nanoclaw's `src/providers/` covers it.
- **Pool-snapshot ingestion / Anthropic dashboard scrape / OCR fallback** — never (decisions/04, LOCKED).
- **Custom skill resolution engine** — convention skill (`container/skills/role-resolver/`) is sufficient for ≤4 users / ~20 skills (decisions/01-skill-resolution.md, LOCKED).
- **Hermes-style auto-save without approval** — every skill write goes through propose-and-confirm; child/guest hard-skip (decisions/05-self-improving.md, LOCKED).
- **Per-container Whisper / long-lived voice daemon** — host-side `execFile` per call beats both on memory and complexity (decisions/03-voice.md, LOCKED).
- **Vault-sync daemon** — `groups/<folder>/` IS the Obsidian vault; PARA folders symlinked to iCloud (decisions/06-obsidian-markdown.md).
- **Persona feedback loop / weekly review automation** — manual review fine for household of 2; defer until ≥4 active users.

## Context

**Hardware:** Mac Mini M2, 8 GB RAM. Memory pressure shapes major decisions (per-container Whisper rejected, host runtime kept lean, CJK fonts off by default).

**Lineage:** Two-step port — Python `homestead` original → TS/Bun `super-david-ramos/homestead-ts` mirror → port the *capabilities* (not the runtime) into `qwibitai/nanoclaw` v2 fork. Upstream wins on conflicts; surface in completion report.

**Architecture inherited from nanoclaw v2:**
- Single Bun host orchestrates per-session agent containers. Host ↔ container IO is **exclusively** the two session SQLite files (`inbound.db`, `outbound.db`). No IPC, no pipes, no file watchers.
- Single-writer rule per SQLite file. Session DBs use `journal_mode=DELETE` for cross-mount visibility (Docker bind mount).
- Channels and providers ship from sibling branches (`channels`, `providers`); trunk is registry only. Installed via `/add-<name>` skills.
- Secrets via OneCLI Agent Vault — never env vars in containers, never chat context.
- Memory is markdown by default — `groups/<folder>/CLAUDE.md` + `*.md` files, already Obsidian-compatible.

**Active branch:** `feat/host-bun-migration` (NOT pushed; ahead of `main`). Bun migration shipped 2026-05-03; installer rewrite in flight.

**Service:** launchd `com.nanoclaw-v2-0ee3f1ca`, `Program` points at `~/Applications/Homestead Nanobot.app/Contents/MacOS/homestead-nanobot` (BTM-stable bundle wrapper that `exec`s `bun`).

**Working norms:** TDD strict (red commit → green commit). Integration tests preferred at host↔container boundary. Demo scripts at major task boundaries (`tests/demo/<phase>/<feature>/`). Completion report per major task. See `docs/plan/conventions.md`.

## Constraints

- **Tech stack — host runtime**: Bun ≥ 1.3.13 (was Node + pnpm + vitest + tsx + better-sqlite3) — host migration shipped 2026-05-03; bun:sqlite built-in, no native modules.
- **Tech stack — agent-runner**: Bun, separate package tree under `container/agent-runner/`. Not part of host's Bun workspace.
- **Tech stack — agent runtime**: Claude Agent SDK in-container + OneCLI Agent Vault for credentials. No Claude Code CLI / Max OAuth (LOCKED, decisions/04).
- **Hardware**: Mac Mini M2, 8 GB RAM — voice models live host-side (per-call `execFile`); CJK fonts default off; memory budget gates per-container decisions.
- **Supply chain**: `bunfig.toml` `install.minimumReleaseAge = 259200` (3 days). `bun install --frozen-lockfile` in CI / automation / container builds. `trustedDependencies` and `minimumReleaseAgeExcludes` require explicit human approval before adding.
- **SQLite — session DB pragmas**: `journal_mode=DELETE`, `busy_timeout=5000`, `foreign_keys=ON`. Load-bearing for cross-mount visibility. Central DB is `WAL`.
- **SQLite — bun:sqlite host mode**: Host opens DBs with `{ strict: true }`, uses `@name` SQL + bare JS keys. Container opens without `strict`, uses `$name` in both. `.get(...)` returns `null` (not `undefined`) — getters returning `T | undefined` MUST append `?? undefined`.
- **Test runner**: `bun test --isolate` (host). Without `--isolate`, `mock.module` registrations leak across files. Imports from `bun:test`, not `vitest`.
- **launchd integration (macOS BTM)**: plist `Program` MUST point at the `Homestead Nanobot.app` bundle wrapper, never directly at `bun`. Direct bun edits trigger BTM re-approval which can `bootout` the service.
- **Channels/providers**: Trunk does NOT ship channel adapters or non-default providers. Install via `/add-<name>` skills (`channels`/`providers` branches). Each skill is idempotent and ends in `bun add <pkg>@<pinned-version>`.
- **Two-DB session split**: Each session has `inbound.db` (host writes, container reads) + `outbound.db` (container writes, host reads). Exactly one writer per file. Heartbeat is `touch` on `/workspace/.heartbeat`. Host uses even `seq`, container uses odd.
- **Voice runtime**: STT via host-side `whisper-cli` (Homebrew `whisper-cpp`, Metal-accelerated bottle on Apple Silicon) + `ffmpeg` 16kHz mono normalization. Default model `ggml-base.bin` (147 MB) under `data/models/`. ~1s wall per 30s of audio on M1+.
- **Memory surface**: Plain GFM markdown only in stored notes. Slack mrkdwn / Telegram-flavored markdown applies only to outbound messages. PARA-ish layout per group (`projects/`, `areas/`, `resources/`, `archive/`, `conversations/`). Wikilinks `[[...]]` allowed (Obsidian-native, ignored by stock renderers).
- **Skill resolution**: User > role > shared first-match priority via `groups/<group>/skills/{users/<user_id>,roles/<role>,shared}/<skill-name>/SKILL.md`. Convention enforced by `container/skills/role-resolver/SKILL.md`.
- **CJK fonts**: Off by default (~200 MB saved). Enable via `INSTALL_CJK_FONTS=true` in `.env` + `./container/build.sh` rebuild.
- **Rollback (Bun migration)**: < 2-min documented rollback exists (pre-bun launchd plist backup at `*.pre-bun-backup`; `pnpm-lock.yaml` lives in main's git history).

## Key Decisions

<!-- Decisions that constrain future work. The four LOCKED ADRs are anchors and cannot be auto-overridden. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| **DEC-skill-resolution (LOCKED)** — user > role > shared skill resolution as a container-skill convention (decisions/01) | homestead-ts capability shipped via single convention skill + 3-dir layout per group; sufficient for ≤4 users / ~20 skills | ✓ Good — shipped 2026-04-25 |
| **DEC-policy-opa** — drop OPA for v0; bring back only for high-stakes flows (decisions/02) | nanoclaw primitives (`user_roles`, OneCLI, `pending_approvals`, `unknown_sender_policy`) cover adult-only household | — Pending — reintroduction triggers: Owen role, external comms, audit needs |
| **DEC-voice (LOCKED)** — Voice (Whisper/Kokoro) wraps every text channel as host-side I/O preprocessor/postprocessor (decisions/03) | Per-container Whisper rejected (200-300 MB resident × N containers on 8 GB box); host-side `execFile` per call is simpler | ✓ Good — shipped Phase 1, 2026-05-02 |
| **DEC-no-pool-no-max (LOCKED)** — no pool-aware substitution, no Claude Code CLI / Max OAuth runtime (decisions/04) | No evidence cost is the bottleneck; nanoclaw `src/providers/` already covers it | ✓ Good — locked |
| **DEC-self-improving (LOCKED)** — self-improving skills via propose-and-confirm (decisions/05) | Hermes' silent auto-save inverted: eligibility check + `ask_user_question` approval gate + 3-tier writes + child/guest hard-skip | ✓ Good — shipped 2026-04-26 |
| **DEC-obsidian-markdown** — Obsidian-compatible markdown for the memory surface (decisions/06) | Group folders ARE the vault — no sync layer; PARA layout + GFM only in stored notes | ✓ Good — shipped Phase 0 |
| **Voice-reply medium-match** — voice-reply only when triggering message was a voice note (Phase 1 close) | Symmetric in DM and group; supersedes original per-user opt-in column (`users.prefers_voice_replies` shipped but unused) | ✓ Good — shipped 2026-05-02 |
| **Family agent always-engage** — `engage_pattern='.'` for family chat (Phase 1 close) | Replaces original `\b[Bb][Aa][Rr][Nn][Aa][Bb][Yy]\b` mention-only pattern | ✓ Good |
| **Bun on host** — Node+pnpm+vitest+tsx+better-sqlite3 → Bun + bun:sqlite + bun:test (Phase Bun-Migration) | Single tool chain; native sqlite; faster startup; supply-chain gate preserved via `bunfig.toml` | ✓ Good — shipped 2026-05-03 |
| **BTM bundle wrapper** — launchd plist `Program` points at `Homestead Nanobot.app`, not directly at `bun` (Phase Bun-Migration post-cutover) | Insulates launch item from BTM re-approval when Bun's code-signing identity changes | ✓ Good — locked-in convention |

---
*Last updated: 2026-05-08 after `/gsd-new-project` from-ingest bootstrap*
