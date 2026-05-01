#!/usr/bin/env bash
# Phase-0 wrap demo — verifies the family agent is wired and the most recent
# real Telegram roundtrip succeeded.
#
# Read-only by design: inspects the live data/v2.db, the on-disk groups/family/
# tree, the family session DBs, and recent log lines. Does NOT inject any
# synthetic message — a real container roundtrip from this script would
# either spam the live family Telegram chat or require an isolated env that
# duplicates the family persona. The roundtrip itself is exercised by sending
# a real Telegram message containing "barnaby" (case-insensitive) before
# running this script.
#
# Idempotent: nothing is written. Re-running just re-reads.
#
# Exit codes:
#   0 — wiring is in place AND a recent successful routing event was found
#   1 — wiring missing or no recent activity (likely you never sent a message)
#   2 — preconditions not met (service down, DB missing)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"

DB="data/v2.db"
LOG="logs/nanoclaw.log"
FAMILY_FOLDER="family"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
header() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

# ---- preconditions ----

if ! command -v sqlite3 >/dev/null 2>&1; then
  red "sqlite3 not on PATH"
  exit 2
fi
if [[ ! -f "$DB" ]]; then
  red "central DB not found at $DB"
  exit 2
fi

# ---- 1. service status ----

header "1. Service status"
if launchctl list 2>/dev/null | grep -q nanoclaw; then
  green "✓ launchd service is running"
else
  yellow "⚠ launchd service is NOT loaded (delivery polls won't fire)"
fi

# ---- 2. central DB wiring ----

header "2. Central DB wiring (data/v2.db)"

AG_ID="$(sqlite3 "$DB" "SELECT id FROM agent_groups WHERE folder='$FAMILY_FOLDER'")"
if [[ -z "$AG_ID" ]]; then
  red "✗ no agent_groups row with folder='$FAMILY_FOLDER'"
  exit 1
fi
green "✓ agent group: $AG_ID"

sqlite3 -header -column "$DB" <<SQL
SELECT name, folder, agent_provider FROM agent_groups WHERE id='$AG_ID';
SQL

WIRING_COUNT="$(sqlite3 "$DB" "
SELECT COUNT(*) FROM messaging_group_agents WHERE agent_group_id='$AG_ID'
")"
if [[ "$WIRING_COUNT" -eq 0 ]]; then
  red "✗ agent group has zero messaging_group_agents rows"
  exit 1
fi
green "✓ wired to $WIRING_COUNT messaging group(s)"

sqlite3 -header -column "$DB" <<SQL
SELECT mg.platform_id, mg.name, mg.is_group,
       mga.engage_mode, mga.engage_pattern
  FROM messaging_group_agents mga
  JOIN messaging_groups mg ON mg.id = mga.messaging_group_id
 WHERE mga.agent_group_id = '$AG_ID';
SQL

# ---- 3. on-disk filesystem ----

header "3. On-disk state (groups/$FAMILY_FOLDER/)"

if [[ ! -d "groups/$FAMILY_FOLDER" ]]; then
  red "✗ groups/$FAMILY_FOLDER/ missing"
  exit 1
fi
ls -1 "groups/$FAMILY_FOLDER" | while read -r entry; do
  echo "  $entry"
done

if [[ ! -f "groups/$FAMILY_FOLDER/CLAUDE.local.md" ]]; then
  yellow "⚠ groups/$FAMILY_FOLDER/CLAUDE.local.md missing — agent will boot with no persona"
else
  green "✓ persona at groups/$FAMILY_FOLDER/CLAUDE.local.md"
fi

for tier in users roles shared; do
  if [[ -d "groups/$FAMILY_FOLDER/skills/$tier" ]]; then
    green "✓ skills/$tier/"
  else
    red "✗ skills/$tier/ missing"
  fi
done

# ---- 4. recent routing activity ----

header "4. Recent routing activity ($LOG)"

if [[ ! -f "$LOG" ]]; then
  yellow "⚠ no log file at $LOG — host hasn't run yet?"
  ROUTED_LINE=""
else
  ROUTED_LINE="$(grep "$AG_ID" "$LOG" 2>/dev/null | grep "Message routed" | tail -1 || true)"
fi

if [[ -z "$ROUTED_LINE" ]]; then
  yellow "⚠ no 'Message routed' log line found for $AG_ID"
  yellow "  Send a Telegram message containing 'barnaby' to the wired chat,"
  yellow "  then re-run this demo."
else
  green "✓ most recent route:"
  echo "  $ROUTED_LINE"
fi

# ---- 5. session inbound/outbound ----

header "5. Session DBs (data/v2-sessions/$AG_ID/)"

SESSION_ROOT="data/v2-sessions/$AG_ID"
if [[ ! -d "$SESSION_ROOT" ]]; then
  yellow "⚠ no session directory yet — no message has been routed to this agent"
else
  for sess_dir in "$SESSION_ROOT"/sess-*; do
    [[ -d "$sess_dir" ]] || continue
    sess_id="$(basename "$sess_dir")"
    in_db="$sess_dir/inbound.db"
    out_db="$sess_dir/outbound.db"
    echo "session: $sess_id"
    if [[ -f "$in_db" ]]; then
      in_count="$(sqlite3 "$in_db" "SELECT COUNT(*) FROM messages_in")"
      echo "  inbound.db: $in_count message(s)"
      sqlite3 -header -column "$in_db" \
        "SELECT seq, kind, status, substr(content, 1, 80) AS preview FROM messages_in ORDER BY seq DESC LIMIT 3"
    fi
    if [[ -f "$out_db" ]]; then
      out_count="$(sqlite3 "$out_db" "SELECT COUNT(*) FROM messages_out")"
      echo "  outbound.db: $out_count message(s)"
      sqlite3 -header -column "$out_db" \
        "SELECT seq, kind, substr(content, 1, 80) AS preview FROM messages_out ORDER BY seq DESC LIMIT 3"
    fi
  done
fi

# ---- 6. agent-written notes ----

header "6. Agent-written notes (groups/$FAMILY_FOLDER/conversations/)"

CONV_DIR="groups/$FAMILY_FOLDER/conversations"
if [[ ! -d "$CONV_DIR" ]]; then
  yellow "⚠ $CONV_DIR/ missing — bootstrap should have created it"
else
  notes="$(find "$CONV_DIR" -type f ! -name '.gitkeep' 2>/dev/null || true)"
  if [[ -z "$notes" ]]; then
    yellow "⚠ no notes yet (agent has not been asked to remember anything)"
  else
    echo "$notes" | while read -r f; do
      echo "  $f ($(wc -c < "$f") bytes)"
    done
  fi
fi

# ---- summary ----

header "Summary"

if [[ -n "$ROUTED_LINE" ]]; then
  green "✓ Phase-0 family roundtrip is live: wiring is in place AND a real message has flowed through."
  exit 0
else
  yellow "⚠ Wiring is in place but no recent route observed."
  yellow "  Send 'hi barnaby' to the wired Telegram group, then re-run."
  exit 1
fi
