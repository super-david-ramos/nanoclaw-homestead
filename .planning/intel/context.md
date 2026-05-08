# Context Intel

Synthesized from DOC sources. Running notes by topic, source-attributed verbatim.

---

## Project framing — nanoclaw-homestead extension

source: `docs/plan/README.md`

A fork of `qwibitai/nanoclaw` v2 layered with multi-user household-agent capabilities ported from `super-david-ramos/homestead-ts`. The household uses chat channels (Telegram, iMessage, etc.), supports voice in/out on every channel, persists memory in markdown the household can browse via Obsidian, and runs on a Mac Mini M2 (8 GB RAM).

**Build inside nanoclaw v2's mental model — not by porting homestead's runtime.** Keep homestead's user-visible value, drop the infra nanoclaw already covers.

**Read order:** conventions → 01-mental-model → 02-decisions → 05-phases. Reference docs (capability mapping, entity model, open questions, follow-ups) load on demand.

---

## Mental model — nanoclaw v2 invariants we inherit

source: `docs/plan/01-mental-model.md`

- **Single host, per-session containers.** Bun host (was Node) orchestrates; each session runs in its own Docker (or Apple Container) container with the Claude Agent SDK. Host ↔ container IO is **exclusively** the two session SQLite files (`inbound.db`, `outbound.db`) under `data/v2-sessions/<agent_group_id>/<session_id>/`. No IPC, no pipes, no file watchers between them. Heartbeat is a `touch` on `.heartbeat`, not a DB write.
- **Single-writer rule.** Every SQLite file has exactly one writer. Host writes the central DB and every `inbound.db`; container writes only its own `outbound.db`. Cross-mount WAL visibility is unreliable, so session DBs use `journal_mode = DELETE` and the host opens-writes-closes per write.
- **Entity model:**
  ```
  users (id "<channel>:<handle>", kind, display_name)
  user_roles (user_id, role, agent_group_id)       — owner | admin (global or scoped)
  agent_group_members (user_id, agent_group_id)    — unprivileged access gate
  user_dms (user_id, channel_type, messaging_group_id) — cold-DM cache

  agent_groups (workspace, memory, CLAUDE.md, personality, container config)
      ↕ many-to-many via messaging_group_agents (session_mode, trigger_rules, priority)
  messaging_groups (one chat/channel on one platform; unknown_sender_policy)

  sessions (agent_group_id + messaging_group_id + thread_id → per-session container)
  ```
  Privilege is **user-level**, not agent-group-level. Three isolation modes: `agent-shared` (multiple channels, one session), `shared` (multiple channels, separate sessions but shared workspace), separate agent groups (full isolation).
- **Four skill types:**
  - Feature skills — `skill/*` git branches, distributed via merge.
  - Utility skills — `.claude/skills/<name>/` with code, copied in on install.
  - Operational skills — `.claude/skills/<name>/` instruction-only on `main`.
  - Container skills — `container/skills/<name>/` synced into every session container's `.claude/skills/` at startup.
  - All skills use [agentskills.io](https://agentskills.io) standard: `SKILL.md` with YAML frontmatter (`name`, `description`) plus markdown.
- **Channels and providers ship on long-lived branches.** Trunk has the registry, not the implementations. Channels live on `channels` branch; providers on `providers` branch.
- **Secrets via OneCLI Agent Vault.** Never env vars in containers, never chat context. Per-agent secret modes default to `selective`.
- **Memory is markdown by default.** `groups/<folder>/CLAUDE.md` plus arbitrary `*.md` files form per-agent-group memory. `groups/global/CLAUDE.md` shared across groups (writable only by main agent group). Already Obsidian-compatible.
- **Self-modification (today):** one tier — `install_packages` and `add_mcp_server`. Single-admin approval, container restart. Source-level self-edits planned but not shipped.

---

## Decisions index — six load-bearing choices

source: `docs/plan/02-decisions.md`

| # | Decision | Status |
|---|---|---|
| 1 | user > role > shared skill resolution as a container-skill convention | LOCKED |
| 2 | Drop OPA for v0; bring back only for high-stakes flows (Owen, external comms, deletes) | Accepted |
| 3 | Voice (Whisper/Kokoro) wraps every text channel as I/O preprocessor / postprocessor | LOCKED |
| 4 | No pool-aware substitution, no Claude Code CLI / Max OAuth runtime | LOCKED |
| 5 | Self-improving skills via propose-and-confirm (informed by Hermes; opposite defaults) | LOCKED |
| 6 | Obsidian-compatible markdown for the memory surface (PARA layout, GFM) | Accepted |

These are stable. If one needs to change, update the deep file in place with a dated note explaining why — don't append a new decision below.

When in doubt, default to nanoclaw idioms. Push back on plans that re-introduce OPA, pool accounting, the Claude Code CLI runtime, or a custom skill resolution engine before checking whether nanoclaw's existing primitive solves it.

(Each decision now lives in `decisions.md`.)

---

## Capability mapping — homestead-ts → nanoclaw v2

source: `docs/plan/03-capability-mapping.md`

| Homestead-ts capability | Nanoclaw v2 mechanism | Notes |
|---|---|---|
| Multi-channel ingest | `/add-telegram`, `/add-imessage`, `/add-resend` skill branches | Trunk doesn't ship channels |
| Voice in/out on Telegram | STT preprocessor + TTS postprocessor wrapping channel media path | Channel-agnostic, not Telegram-only |
| Skill resolution (user > role > shared) | `container/skills/role-resolver/` | Runtime resolver inside container |
| Single orchestrator + queue | nanoclaw host process + per-session `inbound.db` | FIFO per session |
| OPA default-deny + Rego | Drop in v0; nanoclaw `user_roles` + OneCLI + approvals | Rego returns for high-stakes flows |
| Heartbeat / proactive pushes | `schedule_task` + 60s host-sweep | Morning briefing → scheduled tasks |
| Watchdog / process supervision | launchd plist for `nanoclaw` | already shipped upstream |
| fs-watcher on vault changes | scheduled task with `script` hook | nanoclaw's `script` hook is purpose-built |
| Memory: SQLite + JSONL + Obsidian vault | central + session SQLite + group-folder markdown | PARA layout |
| Pool-aware substitution | DROPPED v0 |  |
| Claude Code CLI runtime / Max OAuth | DROPPED v0 — use OneCLI + Agent SDK |  |
| Persona vs infra naming split | `ASSISTANT_NAME` env + group folder names | Persona = `@Barnaby`; infra = `nanoclaw-homestead` |
| Per-user briefings (David vs Partner) | Different `agent_groups` OR shared with sender-keyed briefing skills | Likely shared + role-resolver — sender-aware output |
| Owen's content filter / time windows | Custom container skill + (later) OPA gate | OPA reintroduction trigger #1 |
| External comms draft-only (email/SMS) | `pending_approvals` flow + (later) OPA | OPA reintroduction trigger #2 |
| Guest access (30-day auto-expire) | Custom messaging-group setup + scheduled cleanup task |  |
| Weekly review report | Scheduled task targeting main group, writes to `groups/main/archive/reviews/` |  |
| Activity replay from JSONL | nanoclaw's session DB + `conversations/` folder | Native — no JSONL layer |
| Telegram inline 👍/👎 feedback | Chat SDK rich content per channel matrix | Investigate per platform |
| Self-improving skills | `container/skills/auto-skill-save/` (propose-and-confirm) |  |

---

## Household entity model (provisional)

source: `docs/plan/04-entity-model.md`

**Status:** Provisional. Validate against `user_roles` + isolation-model specs before wiring. Actual wiring happens during `/setup`, not in this doc.

- **Users (`users` table):**
  - `telegram:<david-id>`, `imessage:<david-handle>` — David has multiple platform identities; one canonical user row per platform. Same for Partner.
  - `telegram:<owen-id>` — Owen (placeholder for now).
  - Guest users created on first contact, auto-tagged with expiry metadata.
- **Roles (`user_roles` table):**
  - David, Partner: `owner` (global). Full access.
  - Owen: `admin` scoped to a kid-only agent group, OR no role at all (member-only). Almost certainly the latter.
  - Guests: no role; just `agent_group_members` membership scoped to a guest-specific agent group.
- **Agent groups (`agent_groups` table):**
  - `family` — shared household memory, shared sessions across David and Partner's channels (Level 2: same agent, separate sessions).
  - `kids` — Owen's isolated agent group when needed. Strict skill set, no external comms tools.
  - `guest` — temporary guests; group folder intentionally small (no household memory access).
  - `main` — privileged admin group nanoclaw ships with.
- **Messaging groups:** per-platform-per-conversation, standard nanoclaw model. `messaging_group_agents` wires which agent group handles which messaging group.

Note: phase-3-owen-safety.md introduces a `child` role (not yet in `user_roles` schema). Treated as planned extension; Phase 3 is gated on a separate ADR (`decisions/07-opa-reintroduction.md`).

---

## Phase index

source: `docs/plan/05-phases.md`

| Phase | Focus | Doc |
|---|---|---|
| 0 | Minimal viable household — one channel, role-resolver, auto-skill-save, Obsidian vault | `phases/phase-0-foundations.md` (DONE) |
| 1 | Voice everywhere — STT preprocessor + TTS postprocessor across all channels | `phases/phase-1-voice.md` (DONE 2026-05-02) |
| 2 | Proactive household value — morning briefing, fs-watcher equivalent | `phases/phase-2-proactive.md` (DONE 2026-05-02; T-2.3 weekly review deferred) |
| 3 | Owen + safety — child role, content filter, OPA reintroduction | `phases/phase-3-owen-safety.md` (gated on ADR-07) |
| Bun migration | Host runtime: Node + pnpm → Bun | `phases/phase-bun-migration.md` (DONE 2026-05-03) |
| Installer rewrite for Bun | `bash nanoclaw.sh` working under Bun for fresh-machine deployments | `phases/phase-installer-bun.md` (T-I.1..T-I.4 done; T-I.5+ pending) |

**Out of scope for v0 (with reintroduction conditions):**

| Capability | Punted because | Bring back when |
|---|---|---|
| OPA / Rego policy engine | nanoclaw primitives sufficient for adult-only household | Owen role lands, OR external comms exit local-only mode |
| Pool-aware substitution + Max OAuth runtime | No evidence cost is the bottleneck pre-shipping | Daily cost > $X sustained; or Max sub becomes worth optimizing for |
| pi-agent-core / Claude Code CLI runtime adapter | nanoclaw's `src/providers/` covers it | Specific need that providers don't satisfy |
| Persona feedback loop / weekly review automation | Manual review fine for household of 2 | Household scales (≥4 active users) |
| Ratcheting test floors | Adopt nanoclaw's CI as-is initially | If forks introduce regressions CI doesn't catch |

**Working pattern (per phase):** Read phase doc → task it out → apply conventions (TDD, demo, completion report) → mark tasks done → file the report.

---

## Open questions

source: `docs/plan/06-open-questions.md`

1. **Project sender→role into `inbound.db`** vs. pass via `messages_in.kind === 'system'` payload? Likely the former; verify against `src/session-manager.ts:writeDestinations` and `writeSessionRouting` patterns. **Blocks:** decisions/01-skill-resolution.md production wiring.
2. ~~**Voice models — host service or per-container?**~~ **Resolved 2026-05-01:** host-side, in-process. `whisper-cpp` (brew, Metal-accelerated bottle) shells out per call. Documented in decisions/03-voice.md.
3. ~~**Per-user voice preference storage**~~ **Resolved 2026-05-01:** new column `users.prefers_voice_replies INTEGER NOT NULL DEFAULT 0`. Documented in decisions/03-voice.md.
4. **iMessage support** — does nanoclaw's `skill/imessage` work on macOS without root? **Blocks:** anything beyond Telegram in Phase 0/1.
5. **Webhook channel for launchd/iOS Shortcuts** — does Chat SDK or Resend cover this, or do we need a thin custom adapter? **Blocks:** any homestead-ts L2 use case that depended on a webhook channel.
6. **Guest auto-expire** — easiest as a daily scheduled task that revokes `agent_group_members` rows past expiry. Confirm `agent_group_members` supports an `expires_at` column or migration needed. **Blocks:** guest agent group setup.

---

## Conventions — TDD + demos + reports

source: `docs/plan/conventions.md`

- **TDD: red → green, no exceptions.** Every behavior change ships with a failing test first. Cycle: red commit (`test:` prefix), green commit (`feat:`/`fix:`), optional refactor commit. Never commit code without a test. "I'll add tests later" is not allowed.
- **Where tests live:**
  - Host (`src/`) — bun:test, `src/**/*.test.ts` co-located. Run via `bun test --isolate`. (Doc still mentions Vitest + `pnpm test`, superseded by phase-bun-migration.md.)
  - Container (`container/agent-runner/`) — bun:test, `container/agent-runner/src/**/*.test.ts`.
  - Skills (`.claude/skills/<name>/` or `container/skills/<name>/`) — Vitest historically; container skills tests now under `pathIgnorePatterns = ["container/**"]`. Filed as a follow-up to migrate.
- **Markdown-only skills (SKILL.md, no code):** test what's mechanically assertable — frontmatter parses, discoverable from directory layout, internal links + section headers match a structural lint, optional snapshot test of SKILL.md content. Behavioral tests deferred to integration suite.
- **Integration tests where available.** Prefer integration over unit. Boundary that matters most: host ↔ container, mediated by `inbound.db` / `outbound.db`. Cross-mount visibility, sequence-number parity (host even / container odd), routing/destinations projection, approval round-trips.
- **Demo scripts at major task boundaries.**
  ```
  tests/demo/<phase>/<feature>/
  ├── README.md
  ├── run.sh            # executable, idempotent if possible
  └── expected.md
  ```
  A demo is **not** a substitute for a test. Tests gate correctness; demos communicate behavior.
- **Completion reports.** Filed at end of each major task. Template under `## Reports` in the relevant phase doc. Sections: What was done / Test coverage (with Scenarios NOT covered) / Demo / Manual validation. Empty section → "n/a — <reason>".
- **Conflicts with upstream:** **Upstream wins.** Surface conflict in completion report's "Manual validation" section so user can decide whether to update upstream or update this convention.

---

## Phase 1 — voice everywhere (DONE 2026-05-02)

source: `docs/plan/phases/phase-1-voice.md`

**Outcome:** voice in + voice out both live in the Homestead Chat. Voice notes in the wired Telegram group transcribe via Whisper and engage Barnaby; replies arrive as audio when the triggering message was a voice note, as text otherwise.

**Implementation:**
- `src/voice/stt.ts` — `transcribeAudio({buffer|path, mime})`. Channel-agnostic. Per-call shell-out to `whisper-cli`.
- `src/voice/transcript-attach.ts` — `attachVoiceTranscripts` auto-applied by chat-sdk-bridge to any audio attachment.
- `src/voice/tts.ts` — `synthesizeSpeech({text})` via macOS `say` + `ffmpeg` → OGG/Opus. (Decision doc names Kokoro 82M as eventual quality target; `say` lands on a fresh install with zero deps.)
- `src/voice/voice-reply.ts` — `triggeredByVoice` (pure decision over `attachments[].mimeType.startsWith('audio/')`) and `synthesizeReplyFile`. Wired into `delivery.ts` via `maybeAttachVoiceReply`.
- Migration 014 — `users.prefers_voice_replies INTEGER NOT NULL DEFAULT 0`.

**Voice-reply rule (chosen):** "only voice-reply when the triggering message was a voice note." Symmetric in DM and group; no recipient-identity resolution needed. Supersedes the original "per-user opt-in" rule (the column shipped but is currently unused).

**Open follow-ups (carried in `follow-ups.md`):**
- Native Telegram voice-note UX (chat-sdk ships all files via `sendDocument`; native `sendVoice` would need a shim).
- `users.prefers_voice_replies` unused — drop in a future migration OR keep as an "always voice" override layered on the medium-match rule.

**Pre-launch fix (caught at live test):** launchd plist `EnvironmentVariables.PATH` must include `/opt/homebrew/bin` so the launchd-spawned host finds `whisper-cli` and `ffmpeg`. Plist not in repo (per-install).

---

## Phase 2 — proactive household value (DONE 2026-05-02)

source: `docs/plan/phases/phase-2-proactive.md`

**Outcome:** Morning briefing scheduled (06:45 local via cron `45 6 * * *`); fs-watcher infra installed (cron `*/15 * * * *`). T-2.3 weekly review deferred.

**Implementation:**
- T-2.1 morning briefing — `scheduleMorningBriefing` helper in `src/modules/scheduling/morning-briefing.ts`; setup script `scripts/init-morning-briefing.ts`. Idempotent, series_id-based, preserves user pause.
- T-2.2 fs-watcher (host-side) — `scheduleFsWatcher` in `src/modules/scheduling/fs-watcher.ts`; setup script `scripts/init-fs-watcher.ts`. Cron `*/15 * * * *`. Default script body: `bun /app/src/scripts/vault-hash.ts /workspace/extra/Homestead /workspace/agent/.fs-watcher-state`.
- T-2.2 fs-watcher (container-side) — `vault-hash.ts` in `container/agent-runner/src/scripts/vault-hash.ts`. Path-aware sha256 over content, mtime-stable, excludes `.obsidian/` / `.DS_Store` / `.trash/`. `fsWatcherDecide` first-run silent baseline, content-diff wake, missing-vault soft-fail.
- iCloud mount wired (option 1) — `additionalMount` entry in `groups/family/container.json` (gitignored, per-install) for iCloud Obsidian vault root, mounted read-only at `/workspace/extra/Homestead`. Allowlist entry at `~/.config/nanoclaw/mount-allowlist.json`.

**Test coverage:** 27 new host tests (`bun test` 261 → 288 passing) + 16 new container tests (vault-hash). Pre-existing `poll-loop`/`factory.test.ts` failures predate this work (out of scope).

**Open follow-ups:**
- fs-watcher data shape — per-file diff vs aggregate hash only. Currently returns `{prevHash, currHash, fileCount}`. Upgrade if agent responses become noisy.
- Live-container respawn flag in demo (`run.sh --respawn`). Currently invasive enough left manual.

---

## Phase 3 — Owen + safety (PRE-PHASE GATE NOT MET)

source: `docs/plan/phases/phase-3-owen-safety.md`

**Goal:** the household is safe to extend to a child role. Content filter, time-window enforcement, hard-deny on external comms for the child role. **This phase is the trigger condition for OPA reintroduction (decisions/02-policy-opa.md).**

**Pre-phase gate (do not start tasks until):**
- A separate decision doc exists at `docs/plan/decisions/07-opa-reintroduction.md` describing Rego bundle layout, MCP-tool-gate shape, admin approval flow.
- Owen's actual user identity and platform are confirmed.
- The `kids` agent group is registered in `agent_groups`.

**Tasks (skeleton):**
- T-3.1 `kids` agent group bootstrap (same shape as T-0.6 family, strict skill set).
- T-3.2 Owen role enforcement at the host. Wire `child` role into `user_roles`. Host gates external comms tools for any user with `role = child`.
- T-3.3 Time-window enforcement (kid 7:00–19:30 weekdays, 8:00–20:00 weekends). Outside-window → message dropped with polite explanation queued for admin review.
- T-3.4 Content filter (uses OPA reintroduction).
- T-3.5 Transcript review queue. Daily scheduled task summarizes Owen's transcripts, emits admin-card.

---

## Follow-ups (deferred work)

source: `docs/plan/follow-ups.md`

**Resume pointer (session ending 2026-05-03):** Branch `feat/host-bun-migration` (20 commits ahead of `main`, NOT pushed). Bun migration done, router test coverage substantially closed, Homestead Nanobot bundle wired into `/setup`, README + CHANGELOG updated.

**Active next task** when this session paused: rewriting `nanoclaw.sh` (and the chain it touches: `setup/install-node.sh`, `setup/probe.sh`, `pnpm --silent run setup:auto` hand-off) to install Bun instead of Node + pnpm. Required for fresh-machine Mac Mini deployment. Now in progress as `phase-installer-bun.md` (T-I.1..T-I.4 done as of 2026-05-08).

**Open entries:**
- Translated READMEs (`README_zh.md`, `README_ja.md`) still reference Node + pnpm. Lowest urgency.
- `writeOutboundDirect` / `openOutboundDb` naming asymmetry — cosmetic-but-load-bearing rename to prevent next "I called the read-only one for writes" bug. Defer until next session-db touch.
- `delivery.ts` (~49% line / 47% func) and `host-sweep.ts` (~21% line / 22% func) coverage low. Realistic batch: 8-12 tests for delivery, 6-10 for host-sweep.
- `src/router.ts` branch coverage substantially closed; remaining gaps deferred to coverage report inspection.
- Native Telegram voice-note UX — small `voice-note-send` shim for `audio/*` mime types intercepting before `bridge.send`.
- Drop or repurpose `users.prefers_voice_replies` (unused since "match the medium" rule). Schema-wise either is fine; SQLite tolerates unused columns indefinitely.
- Per-file-hash fs-watcher state — persist `Map<relPath, sha256>` for `{added, removed, modified}` diff. Defer until agent responses feel un-targeted.
- Pre-existing bun-test failures in `factory.test.ts` + `poll-loop` (1 fail / 2 errors). `poll-loop.ts:273` calls `getInboundDb()` which opens `DEFAULT_INBOUND_PATH` read-only at import time when test env lacks it.
- Live-container smoke step in `run.sh` — `--respawn` flag opt-in.

---

## Glossary

- **Persona vs infra naming:** Persona = `Barnaby` (configurable assistant identity). Infra = `nanoclaw-homestead` (repo / project name).
- **`groups/<folder>/`** — per-agent-group filesystem (CLAUDE.md, skills, memory). Already Obsidian-compatible.
- **`groups/global/CLAUDE.md`** — shared facts written by main agent group only.
- **Engage modes** — `mention`, `mention-sticky`, `pattern` (regex), and `.` (always-engage). Family chat currently runs `.` (always-engage) per Phase 1 close.
- **Session DB locations** — `data/v2-sessions/<agent_group_id>/<session_id>/{inbound,outbound}.db`.
- **Central DB** — `data/v2.db`. Holds users, user_roles, agent_groups, messaging_groups, wiring, pending_approvals, user_dms, chat_sdk_*, schema_version.
