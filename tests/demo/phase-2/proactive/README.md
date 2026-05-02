# Phase 2 demo — proactive household value

Shows the two Phase 2 deliverables end-to-end:

1. **Morning briefing** (T-2.1) — a recurring `messages_in` task in the family
   agent's session, wakes Barnaby at 06:45 local for a household briefing.
   Idempotent setup script. No pre-task script — daily briefings need fresh
   judgment every fire (per `scheduling.instructions.md` §"When NOT to use
   scripts").

2. **fs-watcher** (T-2.2) — a recurring task with a content-hash gate over the
   household Obsidian vault. Wakes Barnaby only when vault content changed,
   not on every tick. Uses the iCloud Obsidian vault mounted into the family
   container at `/workspace/extra/Homestead`.

## Prerequisites

- Family agent + active session must already exist:
  - `scripts/init-family-agent.ts` has been run (Phase 0)
  - At least one message has been exchanged in the wired Telegram chat (so a
    session exists in the central DB)
- Both Phase 2 setup scripts have been run:
  - `pnpm exec tsx scripts/init-morning-briefing.ts`
  - `pnpm exec tsx scripts/init-fs-watcher.ts`
- Family container is running (host service running). The demo is best-effort
  about this — section 3 prints a guidance message if not.

## Run

```
bash tests/demo/phase-2/proactive/run.sh
```

Idempotent — uses the live family inbound.db read-only and a `/tmp` fixture
for the synthesis section. No writes to user-facing chat.

## What it shows

See [expected.md](expected.md) for the line-level expectations.

- **Section 1** — both `task-morning-briefing` and `task-fs-watcher` appear in
  the family inbound.db with their respective cron expressions and
  `process_after` timestamps. content_bytes confirms each row carries a
  prompt body (and the fs-watcher's script body too).

- **Section 2** — vault-hash.ts exercised against a synthetic fixture vault.
  Five ticks demonstrate the contract:
  1. firstRun records baseline, wakeAgent:false (no phantom diff on deploy)
  2. No change → wakeAgent:false
  3. New file added → wakeAgent:true with prevHash + currHash; state advanced
  4. State already advanced → wakeAgent:false
  5. mtime-only "iCloud touch" → wakeAgent:false (content-hash, not mtime)

- **Section 3** — live container smoke. Confirms vault-hash.ts is
  bind-mounted into the running family container (it lives under
  `container/agent-runner/src/scripts/`, mounted at `/app/src/scripts/`),
  and runs cleanly. If the iCloud mount has not taken effect on the running
  container yet (e.g. it was spawned before the `container.json` edit), the
  output is `vaultMissing:true` — that is the *correct* soft-fail behavior
  and not a bug. Next container respawn will pick up the mount.

## Triggering the next respawn

The fs-watcher fires every 15 minutes (cron `*/15 * * * *`). Once the family
container respawns with the iCloud mount active, the next tick will record
the real baseline (firstRun:true) and subsequent ticks will detect Obsidian
edits.

To force a respawn:
- Send any message in the wired Telegram chat — the host will pick up a new
  session and spawn a fresh container.
- Or restart the host service: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`.
- Or kill the container directly: `docker rm -f nanoclaw-v2-family-<id>`. The
  next due message will trigger respawn within 60s (sweep tick).
