# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08)

**Core value:** Daily-use household reliability — household uses agent daily across Telegram + iMessage + voice with zero unrecovered failures over a 30-day window.
**Current focus:** Phase 5 — Installer Rewrite for Bun (T-I.5+ pending)

## Current Position

Phase: 5 of 6 (Installer Rewrite for Bun)
Plan: T-I.4 of T-I.? (T-I.1..T-I.4 closed; T-I.5+ pending)
Status: In Progress (active branch `feat/host-bun-migration`, NOT pushed; ahead of `main`)
Last activity: 2026-05-08 — `/gsd-new-project` from-ingest bootstrap of `.planning/` artifacts

Progress: [████████░░] ~80% (4 of 6 phases shipped; phase 5 partially closed)

## Performance Metrics

**Velocity:**
- Total phases completed: 4 (Foundations, Bun Migration, Voice, Proactive)
- Phase 5 partial: 4 tasks closed (T-I.1, T-I.2, T-I.3, T-I.4)
- Total plans completed: per-task counts not tracked in gsd format (phases 1-4 were executed against in-repo phase docs, not gsd plans)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundations | TBD | shipped 2026-05-01 | n/a |
| 2. Bun Migration | TBD | shipped 2026-05-03 | n/a |
| 3. Voice Everywhere | TBD | shipped 2026-05-02 | n/a |
| 4. Proactive | TBD | shipped 2026-05-02 | n/a |
| 5. Installer-Bun | 4 done / ? pending | in progress | n/a |

**Recent Trend:**
- Last 3 commits: 8b5a3b0 (T-I.4 — drop better-sqlite3 native check, swap for `.bin/` marker), 3408170 (T-I.1+T-I.2+T-I.3 — rewrite bootstrap chain for Bun), 54a3f71 (plan: phase-installer-bun)
- Trend: Stable, on the active task spine

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table. Four LOCKED ADRs anchor the architecture:

- **DEC-skill-resolution (LOCKED)**: user > role > shared via `container/skills/role-resolver/` convention
- **DEC-voice (LOCKED)**: voice wraps every text channel host-side via `whisper-cli` + `say`/`ffmpeg`; medium-match reply rule
- **DEC-no-pool-no-max (LOCKED)**: no Anthropic-dashboard scrape, no Claude Code CLI / Max OAuth runtime; stay on Agent SDK + OneCLI
- **DEC-self-improving (LOCKED)**: skills via propose-and-confirm with eligibility check + `ask_user_question` + child/guest hard-skip

Recent decisions affecting current work:

- Phase 2 (Bun Migration): launchd plist `Program` MUST point at `Homestead Nanobot.app` bundle wrapper (BTM-stable); never directly at `bun`. Plist edits trigger BTM re-approval which can `bootout` the service.
- Phase 5 (Installer-Bun) T-I.4: dropped `better-sqlite3` native verify in `setup/probe.sh` (bun:sqlite is built-in); swapped for `.bin/` marker check.
- Phase 1 close: family agent `engage_pattern='.'` (always-engage), supersedes original Barnaby-mention regex.
- Phase 3 close: voice-reply medium-match rule supersedes per-user `prefers_voice_replies` opt-in (column shipped in migration 014, currently unused).

### Pending Todos

From follow-ups.md (carried into v2 / out of scope as appropriate):

- Translated READMEs (`README_zh.md`, `README_ja.md`) still reference Node + pnpm. Lowest urgency.
- `writeOutboundDirect` / `openOutboundDb` naming asymmetry — defer until next session-db touch.
- Coverage gaps: `delivery.ts` (~49% line / 47% func), `host-sweep.ts` (~21% line / 22% func).
- Native Telegram voice-note UX shim (`audio/*` mime intercept before `bridge.send`).
- Drop or repurpose `users.prefers_voice_replies` column.
- Per-file-hash fs-watcher state (currently aggregate hash + fileCount).
- Pre-existing bun-test failures in `factory.test.ts` + `poll-loop` (1 fail / 2 errors); `poll-loop.ts:273` opens `DEFAULT_INBOUND_PATH` read-only at import time.
- Live-container respawn flag (`run.sh --respawn`) for demos.

### Blockers/Concerns

- **Phase 6 gate**: `docs/plan/decisions/07-opa-reintroduction.md` must be written before Phase 6 starts. Owen's user identity + platform also need confirmation; `kids` agent group needs to exist in `agent_groups`.
- **Branch posture**: `feat/host-bun-migration` is NOT pushed and is ahead of `main`. Coordinate any push (especially force-push to main) with the user.
- **Open question #1**: Project sender→role into `inbound.db` at session wake (preferred) vs. stuff into `messages_in.content`/system pre-message. Blocks production wiring of decisions/01-skill-resolution.md.
- **Open question #4**: iMessage support — does nanoclaw's `skill/imessage` work on macOS without root? Blocks anything beyond Telegram in Phase 0/1 (already worked around for v1; revisit when adding channels).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Coverage | Pre-existing bun-test failures (`factory.test.ts` + `poll-loop`) | Open follow-up | Phase Bun-Migration close (2026-05-03) |
| Phase 4 | T-2.3 weekly review report | Deferred to v2 | Phase 2-Proactive close (2026-05-02) |
| Phase 3 | Native Telegram voice UX (`sendVoice` shim) | Deferred to v2 | Phase 1-Voice close (2026-05-02) |
| Phase 3 | `users.prefers_voice_replies` unused — drop or repurpose | Open follow-up | Phase 1-Voice close (2026-05-02) |
| Phase 4 | Per-file fs-watcher diff vs aggregate hash | Open follow-up | Phase 2-Proactive close (2026-05-02) |
| Translation | `README_zh.md`, `README_ja.md` Node+pnpm references | Lowest priority | Phase Bun-Migration close (2026-05-03) |

## Session Continuity

Last session: 2026-05-08 (current bootstrap)
Stopped at: `.planning/` artifacts bootstrapped from `.planning/intel/SYNTHESIS.md`. Active phase = Phase 5 (Installer-Bun). Next concrete work: T-I.5+ (TS-side runners, drop `setup/install-node.sh`, drop `package.json packageManager` field, channel installer sweep, demo under `tests/demo/installer-bun/`, completion report).
Resume file: `docs/plan/follow-ups.md` (resume pointer + open ledger). The phase doc `docs/plan/phases/phase-installer-bun.md` is the task-list source of truth for Phase 5.
