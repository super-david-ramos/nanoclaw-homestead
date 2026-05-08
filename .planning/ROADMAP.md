# Roadmap: nanoclaw-homestead

## Overview

A retrospective + forward roadmap for the nanoclaw-homestead fork. Phases 1–4 are shipped and form the validated foundation: minimal viable household, host-runtime migration to Bun, voice on every channel, and proactive briefings/fs-watcher. Phase 5 (active) rewrites the fresh-machine installer chain to run under Bun, unblocking new-Mac deployment. Phase 6 (planned) extends the household to a child role (Owen) with content filter / time windows / transcript review and is gated on a separate ADR for OPA reintroduction.

The journey ends when the household uses the agent daily across Telegram + iMessage + voice with zero unrecovered failures over a 30-day window.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5, 6): Planned milestone work, in execution order
- Decimal phases (e.g., 5.1): reserved for urgent insertions; none currently

- [x] **Phase 1: Foundations** - Minimal viable household: setup, role-resolver, auto-skill-save, Telegram, family agent, Obsidian vault
- [x] **Phase 2: Bun Migration (Host)** - Replace Node + pnpm + vitest + tsx + better-sqlite3 with Bun + bun:sqlite + bun:test
- [x] **Phase 3: Voice Everywhere** - STT (Whisper) + TTS (`say`+ffmpeg) wraps every text channel; medium-match reply rule
- [x] **Phase 4: Proactive Household Value** - Morning briefing 06:45 cron + fs-watcher every 15 min over iCloud Obsidian vault
- [ ] **Phase 5: Installer Rewrite for Bun** - `bash nanoclaw.sh` produces working install on a fresh machine under Bun (T-I.5+ pending)
- [ ] **Phase 6: Owen + Safety** - Child role, content filter, time-window enforcement, transcript review (gated on ADR-07)

## Phase Details

### Phase 1: Foundations
**Goal**: Minimal viable household running end-to-end — one channel, role-resolver convention, auto-skill-save propose-and-confirm, family agent group, Obsidian-rendered memory.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-phase0-setup-host, REQ-phase0-upstream-remote, REQ-phase0-telegram-channel, REQ-phase0-role-resolver-skill, REQ-phase0-auto-skill-save-skill, REQ-phase0-family-bootstrap, REQ-phase0-obsidian-vault, REQ-phase0-demo
**Success Criteria** (what must be TRUE):
  1. Household member can send a Telegram message to the wired chat and receive a reply from the family agent (Barnaby)
  2. Three-tier skill scaffolding (`groups/<group>/skills/{users,roles,shared}/`) exists per agent group, with role-resolver convention skill loaded into the container
  3. `auto-skill-save` proposes new skills with explicit user approval (never silent writes); child/guest hard-skip
  4. Family memory in `groups/family/{projects,areas,resources,archive,conversations}/` renders cleanly in Obsidian (no tofu, no broken wikilinks)
  5. `tests/demo/phase-0/family-roundtrip/run.sh` runs idempotently from repo root and exits 0 when wiring is healthy
**Plans**: TBD (already shipped — phase doc retained as historical record at `docs/plan/phases/phase-0-foundations.md`)
**Status**: Complete (closed 2026-05-01)
**UI hint**: yes (Obsidian vault rendering surface — household-facing memory UI; channels are platform-native)

### Phase 2: Bun Migration (Host)
**Goal**: Host runs on Bun. Single tool chain (no pnpm + vitest + tsx + better-sqlite3 in the host tree). Container-side already migrated separately.
**Depends on**: Phase 1
**Requirements**: REQ-bun-host-migration
**Success Criteria** (what must be TRUE):
  1. `bun run dev` starts the host with hot reload; `bun test --isolate` runs the host suite green (318+/318+ at cutover)
  2. Live launchd service (`com.nanoclaw-v2-0ee3f1ca`) runs `bun run src/index.ts` via the `Homestead Nanobot.app` bundle wrapper (BTM-stable)
  3. `bunfig.toml` carries supply-chain gate `install.minimumReleaseAge = 259200` (3 days) plus `pathIgnorePatterns = ["container/**"]`
  4. Host `bun:sqlite` invariants honored (`{ strict: true }`, `@name` SQL + bare JS keys, `?? undefined` on `T | undefined` getters)
  5. Documented < 2-min rollback recipe exists (pre-bun launchd plist backup; `pnpm-lock.yaml` in main's git history)
**Plans**: TBD (already shipped — phase doc retained at `docs/plan/phases/phase-bun-migration.md`)
**Status**: Complete (closed 2026-05-03)

### Phase 3: Voice Everywhere
**Goal**: Voice in + voice out live in the Homestead Chat. Voice notes transcribe via Whisper and engage the agent; replies arrive as audio when the triggering message was a voice note.
**Depends on**: Phase 1, Phase 2
**Requirements**: REQ-voice-stt, REQ-voice-tts, REQ-voice-pref-column
**Success Criteria** (what must be TRUE):
  1. A voice note sent in any wired text channel transcribes via host-side `whisper-cli` and routes through `inbound.db` with the transcript as a structured field
  2. The agent's reply arrives as an OGG/Opus audio file (via `say` + `ffmpeg`) when the triggering message was a voice note; as text otherwise (medium-match rule)
  3. No voice infrastructure resides in agent containers — only text + an attachment reference
  4. Migration 014 has added `users.prefers_voice_replies` column (currently unused per medium-match rule supersession)
**Plans**: TBD (already shipped — phase doc retained at `docs/plan/phases/phase-1-voice.md`)
**Status**: Complete (closed 2026-05-02)

### Phase 4: Proactive Household Value
**Goal**: Morning briefing scheduled at 06:45 local; fs-watcher equivalent over the iCloud Obsidian vault every 15 minutes.
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: REQ-morning-briefing, REQ-fs-watcher
**Success Criteria** (what must be TRUE):
  1. Cron `45 6 * * *` fires the morning briefing scheduled task; idempotent series_id-based registration; respects user pause
  2. Cron `*/15 * * * *` runs the fs-watcher script; first run silently establishes baseline; subsequent content diffs wake the agent
  3. iCloud Obsidian vault is mounted read-only at `/workspace/extra/Homestead` via `additionalMount` in `groups/family/container.json` with allowlist entry at `~/.config/nanoclaw/mount-allowlist.json`
  4. Container-side `vault-hash.ts` exclusions honored (`.obsidian/`, `.DS_Store`, `.trash/`); missing vault soft-fails
**Plans**: TBD (already shipped — phase doc retained at `docs/plan/phases/phase-2-proactive.md`. T-2.3 weekly review deferred to v2)
**Status**: Complete (closed 2026-05-02)

### Phase 5: Installer Rewrite for Bun
**Goal**: `bash nanoclaw.sh` produces a working install on a fresh machine where Bun is the host runtime. Required for fresh-machine Mac Mini deployment.
**Depends on**: Phase 2 (Bun on host)
**Requirements**: REQ-installer-bun-fresh-machine
**Success Criteria** (what must be TRUE):
  1. On a fresh Mac (no Bun, no Node, no pnpm), `bash nanoclaw.sh` results in a host that starts under Bun and a container image built without the better-sqlite3 native verify
  2. Bash → TS handoff works under Bun (`exec bun run --silent setup/auto.ts`); no `tsx` invocations remain
  3. Channel installer scripts (`setup/install-{discord,gchat,github,imessage,linear,matrix,resend,slack,teams,telegram,webex,whatsapp,whatsapp-cloud}.sh`) use `bun add <pkg>@<version>` (not `pnpm install`)
  4. Status field surfaces `BUN_VERSION` (renamed from `NODE_VERSION`); `setup.sh` exit codes 0=success, 2=bun missing, 1=`bun install --frozen-lockfile` failed
  5. `bun run typecheck` clean and `bun test --isolate` 318+/318+ green at every commit; demo under `tests/demo/installer-bun/` reproduces the fresh-machine path; completion report filed
**Plans**: TBD
**Status**: In Progress — T-I.1 + T-I.2 + T-I.3 + T-I.4 closed (commits 3408170, 8b5a3b0). T-I.5+ pending (TS-side runners, drop `setup/install-node.sh`, drop `package.json packageManager` field, channel installer sweep, demo, completion report)

### Phase 6: Owen + Safety
**Goal**: Household is safe to extend to a child role. Content filter, time-window enforcement, hard-deny on external comms for the child role. Triggers OPA reintroduction.
**Depends on**: Phase 1, Phase 5 (fresh-machine installer must work first); GATED on ADR `decisions/07-opa-reintroduction.md` being written + Owen's actual user identity/platform confirmed + `kids` agent group registered
**Requirements**: REQ-owen-kids-bootstrap, REQ-owen-child-role, REQ-owen-time-windows, REQ-owen-content-filter, REQ-owen-transcript-review
**Success Criteria** (what must be TRUE):
  1. `kids` agent group is registered in the central DB with strict skill set (no external comms tools); same bootstrap shape as T-0.6 family
  2. Any user with `role = child` is hard-denied external comms tools at the host MCP-tool-gate
  3. Messages from child users outside the time window (7:00–19:30 weekdays / 8:00–20:00 weekends) are dropped with a polite explanation queued for admin review
  4. A Rego bundle drives content filtering for the child role via an MCP-tool-gate inside the agent-runner (this is the OPA reintroduction)
  5. A daily scheduled task summarizes the child's transcripts and emits an admin-card to global admins / scoped admins / owners (per `pickApprover` order)
**Plans**: TBD
**Status**: Not started (pre-phase gate not yet met)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6. Phases 1-4 already shipped.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | TBD/TBD | Complete | 2026-05-01 |
| 2. Bun Migration (Host) | TBD/TBD | Complete | 2026-05-03 |
| 3. Voice Everywhere | TBD/TBD | Complete | 2026-05-02 |
| 4. Proactive Household Value | TBD/TBD | Complete | 2026-05-02 |
| 5. Installer Rewrite for Bun | 4/?+ | In Progress | - |
| 6. Owen + Safety | 0/TBD | Not started (gated) | - |

**Notes:**
- Phases 1–4 are encoded retrospectively from shipped phase docs for traceability. They were executed against `docs/plan/phases/phase-{0-foundations,bun-migration,1-voice,2-proactive}.md` rather than gsd plans, so per-plan counts read TBD; completion is authoritative.
- Phase 5 plan count "4/?+" reflects the four committed tasks (T-I.1..T-I.4) plus pending T-I.5+ work; counts will firm up during `/gsd-plan-phase 5`.
- Phase 6 plan structure depends on the not-yet-written ADR-07 (OPA reintroduction).
