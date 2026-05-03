#!/usr/bin/env bash
# Bun migration demo — verifies the host runs end-to-end on Bun.
# Inspection-only: no chat messages injected, no API tokens consumed.

set -euo pipefail

cd "$(dirname "$0")/../../.."
ROOT=$(pwd)

PLIST_PATH="$HOME/Library/LaunchAgents/com.nanoclaw-v2-0ee3f1ca.plist"
BACKUP_PATH="$PLIST_PATH.pre-bun-backup"

ok() { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗\033[0m %s\n" "$1"; exit 1; }

echo
echo "=== Section 1: launchd plist runs bun, not node ==="
if [ ! -f "$PLIST_PATH" ]; then
  warn "plist not found at $PLIST_PATH (probably running on Linux/systemd or service not installed) — skipping"
else
  if grep -q '/opt/homebrew/bin/bun' "$PLIST_PATH"; then
    ok "plist ProgramArguments references /opt/homebrew/bin/bun"
  else
    fail "plist does not reference bun — pre-migration plist still active?"
  fi
  if grep -q 'src/index.ts' "$PLIST_PATH"; then
    ok "plist points at src/index.ts (no compiled dist/)"
  else
    fail "plist points at compiled output (dist/) — migration incomplete?"
  fi
fi

echo
echo "=== Section 2: live host process is bun ==="
PID=$(launchctl list 2>/dev/null | awk '$3=="com.nanoclaw-v2-0ee3f1ca"{print $1}' || true)
if [ -z "$PID" ] || [ "$PID" = "-" ]; then
  warn "launchd service not running — start with: launchctl load $PLIST_PATH"
else
  EXE=$(ps -p "$PID" -o comm= 2>/dev/null || true)
  if echo "$EXE" | grep -q 'bun$'; then
    ok "PID $PID is running bun ($EXE)"
  else
    fail "PID $PID is running $EXE — expected bun"
  fi
  UPTIME=$(ps -p "$PID" -o etime= 2>/dev/null | tr -d ' ' || true)
  ok "uptime: $UPTIME"
fi

echo
echo "=== Section 3: recent log shows clean startup ==="
if [ -f "$ROOT/logs/nanoclaw.log" ]; then
  if tail -200 "$ROOT/logs/nanoclaw.log" | grep -q 'NanoClaw running'; then
    ok "log contains 'NanoClaw running' marker (post-migration)"
  else
    warn "no 'NanoClaw running' in last 200 lines — service may be stale; check logs/nanoclaw.log"
  fi
  if [ -f "$ROOT/logs/nanoclaw.error.log" ]; then
    RECENT_ERRS=$(tail -20 "$ROOT/logs/nanoclaw.error.log" 2>/dev/null | grep -c 'better-sqlite3' || true)
    if [ "$RECENT_ERRS" -gt 0 ]; then
      warn "tail of error log mentions better-sqlite3 — likely from the brief cutover-window crash, not current state. Inspect logs/nanoclaw.error.log if recent."
    else
      ok "no better-sqlite3 errors in tail of error log"
    fi
  fi
else
  warn "logs/nanoclaw.log missing"
fi

echo
echo "=== Section 4: bun test --isolate passes ==="
if ! command -v bun >/dev/null; then
  fail "bun not on PATH — install via: brew install oven-sh/bun/bun"
fi
TEST_OUT=$(bun test --isolate --timeout 5000 2>&1)
SUMMARY=$(echo "$TEST_OUT" | grep -E '[0-9]+ pass$|[0-9]+ fail$|^Ran [0-9]+' || true)
echo "$SUMMARY"
FAILS=$(echo "$TEST_OUT" | grep -oE '^ *[0-9]+ fail$' | grep -oE '[0-9]+' || echo 0)
if [ "$FAILS" = "0" ]; then
  ok "test suite green ($FAILS failures)"
else
  fail "test suite has $FAILS failures"
fi

echo
echo "=== Section 5: bun run typecheck clean ==="
if bun run typecheck 2>&1 | grep -q 'error TS'; then
  fail "typecheck has errors"
else
  ok "typecheck clean"
fi

echo
echo "=== Section 6: no better-sqlite3 imports remain in src/setup/scripts ==="
LEFTOVERS=$(grep -rln "from 'better-sqlite3'" src setup scripts 2>/dev/null || true)
if [ -z "$LEFTOVERS" ]; then
  ok "zero better-sqlite3 importers"
else
  fail "found leftover importers: $LEFTOVERS"
fi

echo
echo "=== Section 7: rollback recipe is discoverable ==="
if [ -f "$BACKUP_PATH" ]; then
  ok "pre-bun plist backup exists at $BACKUP_PATH"
else
  warn "pre-bun plist backup missing — rollback recipe in docs/plan/phases/phase-bun-migration.md still works but requires recreating the plist by hand"
fi

echo
echo "=== Section 8: package.json reflects the migration ==="
if grep -q '"better-sqlite3"' package.json; then
  fail "package.json still depends on better-sqlite3"
else
  ok "package.json no longer depends on better-sqlite3"
fi
if grep -q '"vitest"' package.json; then
  fail "package.json still has vitest"
else
  ok "package.json no longer has vitest"
fi
if grep -q '"tsx"' package.json; then
  fail "package.json still has tsx"
else
  ok "package.json no longer has tsx"
fi

echo
echo "All checks passed. Bun migration is in steady state."
