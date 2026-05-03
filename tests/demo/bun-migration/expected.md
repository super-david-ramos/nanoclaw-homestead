# Expected output

```
=== Section 1: launchd plist runs bun, not node ===
✓ plist ProgramArguments references /opt/homebrew/bin/bun
✓ plist points at src/index.ts (no compiled dist/)

=== Section 2: live host process is bun ===
✓ PID <pid> is running bun (/opt/homebrew/bin/bun)
✓ uptime: <hh:mm>

=== Section 3: recent log shows clean startup ===
✓ log contains 'NanoClaw running' marker (post-migration)
✓ no better-sqlite3 errors in tail of error log
   (OR a soft-warning that the cutover-window crash is in the tail —
    expected on the immediate-post-migration run, fades as new logs accrue)

=== Section 4: bun test --isolate passes ===
 288 pass
 0 fail
Ran 288 tests across 34 files. [<seconds>s]
✓ test suite green (0 failures)

=== Section 5: bun run typecheck clean ===
✓ typecheck clean

=== Section 6: no better-sqlite3 imports remain in src/setup/scripts ===
✓ zero better-sqlite3 importers

=== Section 7: rollback recipe is discoverable ===
✓ pre-bun plist backup exists at ~/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist.pre-bun-backup

=== Section 8: package.json reflects the migration ===
✓ package.json no longer depends on better-sqlite3
✓ package.json no longer has vitest
✓ package.json no longer has tsx

All checks passed. Bun migration is in steady state.
```

## What "fails" mean

| Failure | Likely cause | Fix |
|---|---|---|
| Section 1 plist references node | Pre-bun plist still active | Re-run T-B.8 plist edit (see phase doc rollback recipe in reverse) |
| Section 2 PID shows node | Service didn't restart cleanly after plist swap | `launchctl kickstart -k gui/$(id -u)/com.nanoclaw-v2-0ee3f1ca` |
| Section 3 no 'NanoClaw running' | Service crashing on startup | Check `logs/nanoclaw.error.log` |
| Section 4 fails > 0 | Test regression | Investigate failing test name; likely a new bun:sqlite or bun:test compat issue |
| Section 4 module-not-found | `bun install` not run | `bun install` from root |
| Section 5 type errors | Type augmentation broke (`src/types/bun-sqlite-augment.d.ts`) or bun-types upgrade changed things | Inspect the specific TS error; may need to re-augment Statement |
| Section 6 leftover importers | Someone added a new better-sqlite3 import after the migration | Convert to `bun:sqlite` per the patterns in the phase doc |
| Section 7 backup missing | The `.pre-bun-backup` was deleted | Rollback recipe still works but you'll need to recreate the plist by hand from `git log` |
| Section 8 package.json regression | Someone re-added vitest/tsx/better-sqlite3 | Remove and refactor — there's no need to bring these back post-migration |
