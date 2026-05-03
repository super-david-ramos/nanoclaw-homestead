# Bun migration demo — host runs end-to-end on Bun

Shows the post-migration state: the host is now running on Bun (no more
Node + pnpm + vitest + tsx + better-sqlite3), and the entire test suite
+ the live launchd service confirm it.

This is an inspection-only demo (per `conventions.md` §"Demo at major
task boundaries"): it does not inject messages into the live chat —
that would risk waking real agent containers and consuming API tokens.
It verifies the migration end-to-end via:

1. **Launchd plist** — the registered service runs `bun run src/index.ts`,
   not `node dist/index.js`.
2. **Live process** — the running PID shows `bun` as the executable.
3. **Live log tail** — recent entries show clean startup
   (`NanoClaw running` after migrations) and no fatal errors since
   the cutover.
4. **Test suite** — `bun test --isolate` passes 288/288 against the
   real working tree.
5. **Typecheck** — `bun run typecheck` is clean.
6. **No bun:sqlite incompatibilities** — confirm zero `better-sqlite3`
   imports remain in source, scripts, or setup.
7. **Rollback discoverability** — confirm the pre-bun plist backup
   exists at the documented path.

## Prerequisites

- Bun installed at `/opt/homebrew/bin/bun` (host install, version
  ≥ 1.3.13 — pinned in `.bun-version` and `package.json` engines).
- Live launchd service running (otherwise sections 1-3 are noops with
  a guidance message).
- `node_modules/` installed via `bun install` (otherwise section 4
  fails with module-not-found errors).

## Run

```
bash tests/demo/bun-migration/run.sh
```

See `expected.md` for what each section's output should look like.
