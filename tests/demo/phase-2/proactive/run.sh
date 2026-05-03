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

echo "  Phase 2 tasks — live row per series_id (status pending or paused):"
sqlite3 -header -column "$INBOUND_DB" \
  "SELECT series_id, status, recurrence, process_after, length(content) AS content_bytes
   FROM messages_in
   WHERE series_id IN ('task-morning-briefing','task-fs-watcher')
     AND status IN ('pending', 'paused')
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
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash-cli.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

echo "  tick 2 (no change → wakeAgent:false):"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash-cli.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

echo "  add garden.md, tick 3 (content change → wakeAgent:true):"
echo "# garden" > "$VAULT/garden.md"
TICK3=$(pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash-cli.ts "$VAULT" "$STATE")
echo "    $TICK3"
echo "$TICK3" | grep -q '"wakeAgent":true' || { echo "    FAIL: expected wakeAgent:true"; exit 2; }

echo "  tick 4 (state advanced → wakeAgent:false again):"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash-cli.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

echo "  bump mtime only (iCloud-style touch), tick 5 (wakeAgent:false):"
# macOS-compatible mtime bump — set to a fixed future stamp (no GNU -d).
touch -t 203601011200 "$VAULT/health.md" "$VAULT/garden.md"
pnpm -s exec tsx container/agent-runner/src/scripts/vault-hash-cli.ts "$VAULT" "$STATE" \
  | sed 's/^/    /'

rm -rf "$VAULT" "$STATE"
echo

# -----------------------------------------------------------------------------
# Section 3 — fresh container against the checked-in fixture vault
# -----------------------------------------------------------------------------
# Self-contained: spawns its own short-lived container with the fixture vault
# mounted at /workspace/extra/Homestead and a /tmp scratch dir mounted at
# /workspace/agent. Does NOT use the running family container or the live
# iCloud vault — so this section is safe to run anytime, and what it asserts
# is reproducible regardless of household activity.
# -----------------------------------------------------------------------------
echo "[3/3] Fresh container against fixture vault"
echo "-------------------------------------------"

FIXTURE="$ROOT/tests/fixtures/vault"
SCRATCH=/tmp/phase2-demo-livevault
SCRATCH_AGENT=/tmp/phase2-demo-liveagent

# Pick the agent image (per-install slug). Match by prefix and take the first.
AGENT_IMAGE=$(docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep '^nanoclaw-agent-' | head -1)
if [ -z "$AGENT_IMAGE" ]; then
  echo "  (no nanoclaw-agent image built yet — run ./container/build.sh)"
  exit 1
fi
echo "  image:   $AGENT_IMAGE"
echo "  fixture: $FIXTURE"

# Reset scratch each run so the fixture-vault path always starts clean. We
# copy the fixture (read-only as committed) into a writable scratch dir so
# tick 4 below can edit a file without polluting the repo.
rm -rf "$SCRATCH" "$SCRATCH_AGENT"
mkdir -p "$SCRATCH_AGENT"
cp -R "$FIXTURE" "$SCRATCH"

# Helper — runs vault-hash-cli.ts inside a fresh container and prints the
# resulting JSON line.
run_vault_hash() {
  docker run --rm \
    --entrypoint bun \
    -v "$SCRATCH:/workspace/extra/Homestead:ro" \
    -v "$SCRATCH_AGENT:/workspace/agent" \
    -v "$ROOT/container/agent-runner/src:/app/src:ro" \
    "$AGENT_IMAGE" \
    /app/src/scripts/vault-hash-cli.ts \
    /workspace/extra/Homestead \
    /workspace/agent/.fs-watcher-state 2>&1 | tail -1
}

echo
echo "  tick 1 (firstRun → record baseline):"
TICK1=$(run_vault_hash)
echo "    $TICK1"
echo "$TICK1" | grep -q '"firstRun":true' || { echo "    FAIL: expected firstRun:true"; exit 2; }

echo "  tick 2 (no change → wakeAgent:false):"
TICK2=$(run_vault_hash)
echo "    $TICK2"
echo "$TICK2" | grep -q '"wakeAgent":false' || { echo "    FAIL: expected wakeAgent:false"; exit 2; }

echo "  edit Welcome.md, tick 3 (modified diff):"
echo "" >> "$SCRATCH/Welcome.md"
echo "appended at $(date -u)" >> "$SCRATCH/Welcome.md"
TICK3=$(run_vault_hash)
echo "    $TICK3"
echo "$TICK3" | grep -q '"wakeAgent":true' || { echo "    FAIL: expected wakeAgent:true"; exit 2; }
echo "$TICK3" | grep -q '"modified":\["Welcome.md"\]' || { echo "    FAIL: expected modified=[\"Welcome.md\"]"; exit 2; }

echo "  add projects/q3.md, tick 4 (added diff):"
echo "# q3 plan" > "$SCRATCH/projects/q3.md"
TICK4=$(run_vault_hash)
echo "    $TICK4"
echo "$TICK4" | grep -q '"added":\["projects/q3.md"\]' || { echo "    FAIL: expected added=[\"projects/q3.md\"]"; exit 2; }

echo "  delete areas/health.md, tick 5 (removed diff):"
rm "$SCRATCH/areas/health.md"
TICK5=$(run_vault_hash)
echo "    $TICK5"
echo "$TICK5" | grep -q '"removed":\["areas/health.md"\]' || { echo "    FAIL: expected removed=[\"areas/health.md\"]"; exit 2; }

# Cleanup scratch (state file + writable vault copy).
rm -rf "$SCRATCH" "$SCRATCH_AGENT"

echo
echo "Phase 2 demo complete."
