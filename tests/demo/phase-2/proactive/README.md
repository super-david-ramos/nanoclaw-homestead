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

- **Section 3** — fresh-container exercise against the checked-in fixture
  vault at `tests/fixtures/vault/`. Spawns a short-lived `--rm` container
  per tick, bind-mounts the fixture (read-only) and a `/tmp` scratch dir
  (writable for the state file), and walks through five ticks: firstRun
  baseline → no-change quiet → modified-file diff → added-file diff →
  removed-file diff. Each assertion grep-matches the expected JSON shape;
  the demo exits non-zero on the first failure.

  **The household's real iCloud-synced Obsidian vault is never touched.**
  The original demo used `docker exec` against the live family container;
  the rewrite avoids that so the demo is reproducible from a clean clone
  and doesn't depend on the family container being running.

## Live family-agent verification (separate from this demo)

The demo proves the *machinery* works against a fixture vault. To confirm
the live family agent is producing useful chat messages, edit a real note
in your Obsidian vault and watch for Barnaby's response in the family chat
within 15 minutes. The fs-watcher schedule_task on the live family session
fires every quarter hour; on a content change it surfaces the diff to
Barnaby with read access to the vault, and he posts a short note.
