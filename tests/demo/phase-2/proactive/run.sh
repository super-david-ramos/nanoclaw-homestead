#!/usr/bin/env bash
# Phase 2 demo — proactive household value (morning briefing + fs-watcher).
#
# Sections:
#   1. Inspect the live family inbound.db for the two installed tasks.
#   2. Run vault-hash.ts on a synthetic fixture vault, exercising the full
#      first-run / no-change / content-change / advance cycle.
#   3. Live container smoke — confirm vault-hash.ts is visible inside the
#      currently-running family container and produces well-formed output
#      (vaultMissing soft-fail OR full hash, depending on whether the
#      iCloud mount has taken effect on the running container).
#
# Idempotent. No writes to user-facing chat. Side effects are limited to
# /tmp/phase2-demo-vault* (cleaned up at end).

set -euo pipefail

cd "$(dirname "$0")/../../../.."
ROOT=$(pwd)

echo "Phase 2 demo — proactive (morning briefing + fs-watcher)"
echo "========================================================="
echo

# -----------------------------------------------------------------------------
# Section 1 — installed-tasks inspection in the live family inbound.db
# -----------------------------------------------------------------------------
echo "[1/3] Installed Phase 2 tasks in family inbound.db"
echo "---------------------------------------------------"

FAMILY_AG=$(sqlite3 "$ROOT/data/v2.db" \
  "SELECT id FROM agent_groups WHERE folder='family' LIMIT 1;")
if [ -z "$FAMILY_AG" ]; then
  echo "  (no family agent group — run scripts/init-family-agent.ts first)"
  exit 1
fi

FAMILY_SESS=$(sqlite3 "$ROOT/data/v2.db" \
  "SELECT id FROM sessions WHERE agent_group_id='$FAMILY_AG' AND status='active' LIMIT 1;")
if [ -z "$FAMILY_SESS" ]; then
  echo "  (no active family session — wake the family agent first)"
  exit 1
fi

INBOUND_DB="$ROOT/data/v2-sessions/$FAMILY_AG/$FAMILY_SESS/inbound.db"
echo "  inbound.db: $INBOUND_DB"
echo

echo "  Phase 2 tasks (one row per series_id):"
sqlite3 -header -column "$INBOUND_DB" \
  "SELECT series_id, status, recurrence, process_after, length(content) AS content_bytes
   FROM messages_in
   WHERE series_id IN ('task-morning-briefing','task-fs-watcher')
   ORDER BY series_id;" || echo "  (no rows yet — run init-morning-briefing.ts and init-fs-watcher.ts)"

echo

# -----------------------------------------------------------------------------
# Section 2 — vault-hash full-cycle synthesis on a fixture vault
# -----------------------------------------------------------------------------
echo "[2/3] vault-hash full cycle on fixture /tmp/phase2-demo-vault"
echo "-------------------------------------------------------------"
VAULT=/tmp/phase2-demo-vault
STATE=/tmp/phase2-demo-vault.state

rm -rf "$VAULT" "$STATE"
mkdir -p "$VAULT"
echo "# health" > "$VAULT/health.md"
echo "  fixture: 1 file (health.md)"
echo

echo "  tick 1 (firstRun → record baseline, wakeAgent:false):"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

echo "  tick 2 (no change → wakeAgent:false):"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

echo "  add garden.md, tick 3 (content change → wakeAgent:true):"
echo "# garden" > "$VAULT/garden.md"
TICK3=$(pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash.ts "$VAULT" "$STATE")
echo "    $TICK3"
echo "$TICK3" | grep -q '"wakeAgent":true' || { echo "    FAIL: expected wakeAgent:true"; exit 2; }

echo "  tick 4 (state advanced → wakeAgent:false again):"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

echo "  bump mtime only (iCloud-style touch), tick 5 (wakeAgent:false):"
# macOS-compatible mtime bump — set to a fixed future stamp (no GNU -d).
touch -t 203601011200 "$VAULT/health.md" "$VAULT/garden.md"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

rm -rf "$VAULT" "$STATE"
echo

# -----------------------------------------------------------------------------
# Section 3 — live container smoke
# -----------------------------------------------------------------------------
echo "[3/3] Live container — vault-hash.ts visibility + output"
echo "--------------------------------------------------------"

FAMILY_CTR=$(docker ps --filter "name=nanoclaw-v2-family-" --format "{{.Names}}" | head -1)
if [ -z "$FAMILY_CTR" ]; then
  echo "  (family container not running — host service may be stopped)"
  echo "  Start with: launchctl kickstart -k gui/\$(id -u)/com.nanoclaw"
  exit 0
fi

echo "  container: $FAMILY_CTR"

if docker exec "$FAMILY_CTR" test -f /app/src/scripts/vault-hash.ts 2>/dev/null; then
  echo "  ✓ /app/src/scripts/vault-hash.ts present (via agent-runner-src bind mount)"
else
  echo "  ✗ /app/src/scripts/vault-hash.ts MISSING — bind mount may be stale"
  exit 2
fi

echo
echo "  vault-hash output against /workspace/extra/Homestead:"
docker exec "$FAMILY_CTR" \
  bun /app/src/scripts/vault-hash.ts \
    /workspace/extra/Homestead \
    /workspace/agent/.fs-watcher-state 2>&1 | sed 's/^/    /'
echo
echo "  Reading: vaultMissing:true means the iCloud mount has not taken effect"
echo "  on this container yet (it predates the container.json edit). Next"
echo "  respawn — kill the container or send a Telegram message — will pick"
echo "  up the mount and the next vault-hash tick will record a real baseline."

echo
echo "Phase 2 demo complete."
