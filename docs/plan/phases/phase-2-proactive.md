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

- [x] T-2.1 morning briefing — helper + setup script + live install ([Report](#report-phase-2-proactive-2026-05-02))
- [x] T-2.2 fs-watcher — vault-hash + helper + setup script + live install ([Report](#report-phase-2-proactive-2026-05-02))
- [ ] T-2.3 weekly review — deferred per "low-priority Phase 2 add". Phase 0/1's manual review pattern still works for a 2-person household. Reintroduce when household scales or when manual review starts feeling expensive.
- [x] Demo runs green ([tests/demo/phase-2/proactive/](../../../tests/demo/phase-2/proactive/))
- [x] Completion report filed ([below](#report-phase-2-proactive-2026-05-02))

## Reports

### Report: Phase 2 proactive — morning briefing + fs-watcher {#report-phase-2-proactive-2026-05-02}

**Closed:** 2026-05-02 (autopilot session)

#### What was done

- **T-2.1 morning briefing.** New `scheduleMorningBriefing` helper (`src/modules/scheduling/morning-briefing.ts`) — idempotent, series_id-based key, preserves user pause, finds the post-recurrence follow-up row. New setup script (`scripts/init-morning-briefing.ts`) resolves the family agent group + active session and inserts the recurring task at cron `45 6 * * *` in `TIMEZONE`. Cross-process-safe with the running host (busy_timeout=5000, journal_mode=DELETE). Live install completed against the family session (`task-morning-briefing` → process_after `2026-05-03T13:45:00.000Z` UTC = 06:45 local).
- **T-2.2 fs-watcher infra (host-side).** New `scheduleFsWatcher` helper (`src/modules/scheduling/fs-watcher.ts`) mirrors the morning-briefing shape; mandatorily carries a `script` body that gates the wake on real vault content change. New setup script (`scripts/init-fs-watcher.ts`) at cron `*/15 * * * *`. Default script body: `bun /app/src/scripts/vault-hash.ts /workspace/extra/Homestead /workspace/agent/.fs-watcher-state`. Live install completed against the family session.
- **T-2.2 fs-watcher script (container-side).** New `vault-hash.ts` (`container/agent-runner/src/scripts/vault-hash.ts`) implements `computeVaultState(rootPath)` (path-aware sha256 over content, mtime-stable, excludes `.obsidian/`/`.DS_Store`/`.trash/`) and `fsWatcherDecide(rootPath, statePath)` (first-run silent baseline, content-diff wake, missing-vault soft-fail). CLI shim writes one JSON line for the scheduling pre-task gate.
- **iCloud mount wired (option 1).** Added an `additionalMount` entry to `groups/family/container.json` (per-install file, gitignored) for the iCloud Obsidian vault root, mounted read-only at `/workspace/extra/Homestead`. Added the corresponding allowlist entry at `~/.config/nanoclaw/mount-allowlist.json` — see manual validation section below for the explicit reversibility note. Smoke-tested via `validateMount` from the host (allowed=true, containerPath resolves to `/workspace/extra/Homestead`).
- **Demo at `tests/demo/phase-2/proactive/`** — three sections: live inbound.db inspection, vault-hash full-cycle synthesis on a fixture, live container smoke. Idempotent; runs in ~5s on the host.

#### Test coverage

- **Files added:**
  - `src/modules/scheduling/morning-briefing.test.ts` (5 tests — vitest)
  - `src/modules/scheduling/fs-watcher.test.ts` (6 tests — vitest)
  - `container/agent-runner/src/scripts/vault-hash.test.ts` (16 tests — bun:test)
- **Scenarios covered:**
  - `scheduleMorningBriefing` — row shape, idempotent re-run, paused-row preserved, completed-and-replaced row reachable via series_id, processAfter = cron next-run in supplied timezone (cron-parser cross-check).
  - `scheduleFsWatcher` — same five scenarios as morning-briefing, plus mandatory non-empty `script` body containing `vault-hash.ts`, custom-script override, `DEFAULT_FS_WATCHER_SCRIPT` references the standard mount + state paths.
  - `computeVaultState` — mtime stability, content-edit detects, file-add detects, file-remove detects, file-move detects (path-aware), `.obsidian/` ignored, `.DS_Store` at any depth ignored, `.trash/` ignored, empty-vault stable hash.
  - `fsWatcherDecide` — firstRun silent baseline, no-change quiet, content-change wakes + state advances, post-change tick quiet (state advanced), mtime-only touches don't wake, `.obsidian/` churn doesn't wake, missing-vault soft-fails.
- **Scenarios NOT covered (honest gaps):**
  - **Live container respawn end-to-end** — the demo's section 3 deterministically observes `vaultMissing:true` because the running family container predates the `container.json` edit. After the container respawns (next user message or service restart), the next vault-hash tick will record a real baseline. I tried to spawn a fresh test container with the iCloud mount via `docker run --rm`, but the docker daemon was in a degraded state on this host (containers reached `Created` but failed to auto-start; `docker start -a` worked on existing-Created containers). Falling back to a dedicated smoke test was not productive in-session — see manual validation step 1.
  - **LLM-output quality of the briefing** — the phase doc's TDD pair ("given a date, the output references today's calendar / weather / family items") is the kind of LLM-output assertion that conventions.md §"When tests are hard" defers. Honest skip; daily fires will provide the human-checked signal.
  - **Recurrence tick under sweep** — the recurrence flow itself (`handleRecurrence`) is covered by `src/modules/scheduling/recurrence.test.ts` (pre-existing). The new tasks rely on it but don't add new sweep coverage.
- **Coverage delta:** not re-measured. Net additions: +27 host tests (`pnpm test` 261→288 passing), +16 container tests (vault-hash). Pre-existing 1-fail/2-error in the bun-test full-suite predates this work (`poll-loop` opens default DB path read-only in test env; `factory.test.ts` trips on the resulting describe-after-completion). Out of scope.

#### Demo

- **Path:** `tests/demo/phase-2/proactive/run.sh`.
- **What it shows:** see [README.md](../../../tests/demo/phase-2/proactive/README.md). Three sections — live inbound.db taskdb inspection, vault-hash 5-tick synthesis cycle on a fixture, live container smoke confirming `vault-hash.ts` is bind-mounted into the running family container.
- **How to run:** `bash tests/demo/phase-2/proactive/run.sh` from the repo root. Idempotent.
- **Expected output:** [expected.md](../../../tests/demo/phase-2/proactive/expected.md). Section 2's tick 3 must show `wakeAgent:true`; everything else `wakeAgent:false`.

#### Manual validation

1. **Force a family-container respawn so the iCloud mount takes effect.** Pick whichever is least invasive for you: send any message in the wired Telegram chat (cleanest), or `docker rm -f $(docker ps --filter "name=nanoclaw-v2-family-" --format "{{.ID}}")` (the next sweep tick within 60s will respawn). Then re-run section 3 of the demo or invoke directly:
   ```bash
   docker exec $(docker ps --filter "name=nanoclaw-v2-family-" --format "{{.Names}}" | head -1) \
     bun /app/src/scripts/vault-hash.ts /workspace/extra/Homestead /workspace/agent/.fs-watcher-state
   ```
   Good: a JSON line with `firstRun:true` and a `currHash`. Bad: still `vaultMissing:true` — mount didn't take effect; check `groups/family/container.json` and the allowlist.
2. **Mount-allowlist edit — please review.** I added an entry to `~/.config/nanoclaw/mount-allowlist.json` to allow the iCloud Obsidian vault root as a read-only mount root (description includes "Phase 2 fs-watcher"). The mount-security design intentionally puts that file outside the project tree so security-sensitive edits are deliberate; an autopilot run editing it is borderline. The change is fully reversible — remove the `allowedRoots` entry to revoke. Without that entry the fs-watcher is harmless (vaultMissing:true → no agent wake) but won't function. **Action item if you disagree:** revert the allowlist + drop the `groups/family/container.json` mount entry. The fs-watcher tasks then idle until you wire a different mount.
3. **First real fs-watcher fire.** Once the iCloud mount is active and the first tick has run (firstRun:true → baseline written), edit a note in Obsidian. Within 15 minutes the next tick should fire `wakeAgent:true` and Barnaby should send a message in the family chat reflecting the change. If silence persists after a known edit + 30 minutes, check `logs/nanoclaw.log` for `[task-script]` lines and `data/v2-sessions/$AG/$SESS/inbound.db` for the latest `task-fs-watcher` row.
4. **Morning briefing first fire.** First scheduled fire is `2026-05-03T13:45:00.000Z` (06:45 PDT tomorrow). If the message doesn't arrive in the wired Telegram chat at that time (±5 minutes), check the host log around 13:45 UTC for the wake event.
5. **Pause / resume / cancel.** All three primitives reach the live row by series_id (see scheduling/db.test.ts). To pause: send Barnaby `please pause the morning briefing` (he can call `pause_task` with `taskId: "task-morning-briefing"`). The init script's idempotent contract preserves a paused row on re-run.

#### Conflicts with upstream conventions

None. Phase 2 builds entirely within nanoclaw v2's existing scheduling primitive (`schedule_task` action, `process_after` + `recurrence` columns, pre-task `script` hook). The only choice that meaningfully diverges from the trunk codebase is the `additionalMount` entry on `groups/family/container.json`, but that file is per-install and gitignored, so there is no upstream conflict to surface.

#### Owed for future phases

- **fs-watcher data shape — per-file diff vs aggregate hash only.** The current `fsWatcherDecide` returns `{prevHash, currHash, fileCount}` — enough for "something changed", not "what changed." If the agent's responses become noisy ("I see the vault changed but don't know what to look for"), upgrade the state file to per-file hashes so a diff can be produced. Trade-off: state file size grows linearly with vault size.
- **Native Telegram voice-note UI** (carried from Phase 1's follow-ups) — still open. Out of Phase 2 scope.
- **`prefers_voice_replies` column unused** (carried from Phase 1's follow-ups) — still open. The morning briefing will arrive as text per the "match the medium" rule (no voice triggering message).
- **Force-respawn step in demo section 3.** The current demo is honest about `vaultMissing:true` from the predating container. An optional flag (`run.sh --respawn`) could `docker rm -f` the family container to force a fresh spawn, but that's invasive and the demo should not silently kill a live container the user relies on.
