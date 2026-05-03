# Expected output — Phase 2 proactive demo

The demo prints three sections. Successful output looks like this (hashes
and timestamps will differ between runs; ordering and shape are stable).

```
Phase 2 demo — proactive (morning briefing + fs-watcher)
=========================================================

[1/3] Installed Phase 2 tasks in family inbound.db
---------------------------------------------------
  inbound.db: <project>/data/v2-sessions/<ag-id>/<sess-id>/inbound.db

  Phase 2 tasks — live row per series_id (status pending or paused):
series_id              status   recurrence    process_after             content_bytes
---------------------  -------  ------------  ------------------------  -------------
task-fs-watcher        pending  */15 * * * *  2026-MM-DDTHH:MM:00.000Z  ~970
task-morning-briefing  pending  45 6 * * *    2026-MM-DDT13:45:00.000Z  ~300

[2/3] vault-hash full cycle on fixture /tmp/phase2-demo-vault
-------------------------------------------------------------
  fixture: 1 file (health.md)

  tick 1 (firstRun → record baseline, wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":1,"firstRun":true,"currHash":"<hash>"}}
  tick 2 (no change → wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":1}}
  add garden.md, tick 3 (content change → wakeAgent:true):
    {"wakeAgent":true,"data":{"fileCount":2,...,"added":["garden.md"],...}}
  tick 4 (state advanced → wakeAgent:false again):
    {"wakeAgent":false,"data":{"fileCount":2}}
  bump mtime only (iCloud-style touch), tick 5 (wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":2}}

[3/3] Fresh container against fixture vault
-------------------------------------------
  image:   nanoclaw-agent-v2-<slug>:latest
  fixture: <project>/tests/fixtures/vault

  tick 1 (firstRun → record baseline):
    {"wakeAgent":false,"data":{"fileCount":3,"firstRun":true,"currHash":"<h>"}}
  tick 2 (no change → wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":3}}
  edit Welcome.md, tick 3 (modified diff):
    {"wakeAgent":true,...,"modified":["Welcome.md"]}
  add projects/q3.md, tick 4 (added diff):
    {"wakeAgent":true,...,"added":["projects/q3.md"]}
  delete areas/health.md, tick 5 (removed diff):
    {"wakeAgent":true,...,"removed":["areas/health.md"]}

Phase 2 demo complete.
```

## Reading section 3

The fixture vault at `tests/fixtures/vault/` has 3 files:

- `Welcome.md`
- `areas/health.md`
- `projects/garden.md`

Section 3 copies that fixture to a `/tmp` scratch dir, spawns a fresh
agent container with the scratch dir bind-mounted at
`/workspace/extra/Homestead`, and exercises `fsWatcherDecide` end-to-end
through the production CLI bootstrap (`vault-hash-cli.ts`). The fresh
container is `--rm` and gone after each call; the scratch dir is removed
at end. **The household's real iCloud-synced Obsidian vault is never
touched by this demo.**

## Failure indicators

| Where | Symptom | Fix |
|---|---|---|
| Section 1 | `(no rows yet)` | Run `scripts/init-morning-briefing.ts` and `scripts/init-fs-watcher.ts` first. |
| Section 2 | Tick 3 doesn't show `added:["garden.md"]` | Bug in `vault-hash.ts` — the diff partition broke. |
| Section 3 | `(no nanoclaw-agent image built yet)` | Run `./container/build.sh` once. |
| Section 3 | Any tick fails its `grep -q` assertion | Bug in `vault-hash.ts` or the CLI bootstrap. |
