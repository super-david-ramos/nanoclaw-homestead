# Expected output — Phase 2 proactive demo

The demo prints three sections. Successful output looks like this (timestamps
and hashes will differ between runs).

```
Phase 2 demo — proactive (morning briefing + fs-watcher)
=========================================================

[1/3] Installed Phase 2 tasks in family inbound.db
---------------------------------------------------
  inbound.db: <project>/data/v2-sessions/<ag-id>/<sess-id>/inbound.db

  Phase 2 tasks (one row per series_id):
series_id              status   recurrence    process_after             content_bytes
---------------------  -------  ------------  ------------------------  -------------
task-fs-watcher        pending  */15 * * * *  2026-MM-DDTHH:MM:00.000Z  ~520
task-morning-briefing  pending  45 6 * * *    2026-MM-DDT13:45:00.000Z  ~300

[2/3] vault-hash full cycle on fixture /tmp/phase2-demo-vault
-------------------------------------------------------------
  fixture: 1 file (health.md)

  tick 1 (firstRun → record baseline, wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":1,"firstRun":true,"currHash":"<hash>"}}
  tick 2 (no change → wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":1}}
  add garden.md, tick 3 (content change → wakeAgent:true):
    {"wakeAgent":true,"data":{"fileCount":2,"prevHash":"<oldhash>","currHash":"<newhash>"}}
  tick 4 (state advanced → wakeAgent:false again):
    {"wakeAgent":false,"data":{"fileCount":2}}
  bump mtime only (iCloud-style touch), tick 5 (wakeAgent:false):
    {"wakeAgent":false,"data":{"fileCount":2}}

[3/3] Live container — vault-hash.ts visibility + output
--------------------------------------------------------
  container: nanoclaw-v2-family-<id>
  ✓ /app/src/scripts/vault-hash.ts present (via agent-runner-src bind mount)

  vault-hash output against /workspace/extra/Homestead:
    {"wakeAgent":false,"data":{...}}

  Reading: ...

Phase 2 demo complete.
```

## Reading section 3

After the running family container respawns with the iCloud mount active,
the vault-hash output flips from:

```
{"wakeAgent":false,"data":{"fileCount":0,"vaultMissing":true}}
```

to a real baseline:

```
{"wakeAgent":false,"data":{"fileCount":N,"firstRun":true,"currHash":"<hash>"}}
```

and subsequent ticks return either `{"wakeAgent":false,"data":{"fileCount":N}}`
(no change) or `{"wakeAgent":true,...}` (vault edited).

## Failure indicators

Section 1: `(no rows yet)` → run `init-morning-briefing.ts` and
`init-fs-watcher.ts` first.

Section 2: any tick with unexpected `wakeAgent` shape → bug in vault-hash.ts.

Section 3: `✗ /app/src/scripts/vault-hash.ts MISSING` → bind mount of
`container/agent-runner/src` is stale; restart the host service.
