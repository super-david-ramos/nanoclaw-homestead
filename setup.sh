#!/bin/bash
set -euo pipefail

# setup.sh — Bootstrap script for NanoClaw
# Installs Bun + dependencies, then hands off to the Bun setup modules.
# This is the only bash script in the setup flow.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Where verbose bootstrap logs go. nanoclaw.sh captures setup.sh's stdout to
# the per-step raw log, but legacy code in this script + install-bun.sh
# also calls `log` which writes to a file. Route those to the raw log so
# they don't contaminate the progression log (logs/setup.log).
# Default: write to the raw bootstrap log if nanoclaw.sh pointed us there,
# else fall back to a dedicated bootstrap log (keeps standalone `bash
# setup.sh` invocations working).
LOG_FILE="${NANOCLAW_BOOTSTRAP_LOG:-${PROJECT_ROOT}/logs/bootstrap.log}"

mkdir -p "$(dirname "$LOG_FILE")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [bootstrap] $*" >> "$LOG_FILE"; }

# --- Platform detection ---

detect_platform() {
  local uname_s
  uname_s=$(uname -s)
  case "$uname_s" in
    Darwin*) PLATFORM="macos" ;;
    Linux*)  PLATFORM="linux" ;;
    *)       PLATFORM="unknown" ;;
  esac

  IS_WSL="false"
  if [ "$PLATFORM" = "linux" ] && [ -f /proc/version ]; then
    if grep -qi 'microsoft\|wsl' /proc/version 2>/dev/null; then
      IS_WSL="true"
    fi
  fi

  IS_ROOT="false"
  if [ "$(id -u)" -eq 0 ]; then
    IS_ROOT="true"
  fi

  log "Platform: $PLATFORM, WSL: $IS_WSL, Root: $IS_ROOT"
}

# --- Bun check ---

# The Linux curl-installer drops bun at ~/.bun/bin/bun. Subprocess PATH
# mutation from install-bun.sh doesn't reach us, so re-add that location
# unconditionally before probing.
if [ -d "$HOME/.bun/bin" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi

check_bun() {
  BUN_OK="false"
  BUN_VERSION="not_found"
  BUN_PATH_FOUND=""

  if command -v bun >/dev/null 2>&1; then
    BUN_VERSION=$(bun --version 2>/dev/null)
    BUN_PATH_FOUND=$(command -v bun)
    local major minor
    major=$(echo "$BUN_VERSION" | cut -d. -f1)
    minor=$(echo "$BUN_VERSION" | cut -d. -f2)
    # engines.bun in package.json pins >=1.3.13. Accept 1.3.x and any 2.x+.
    if { [ "$major" -ge 2 ] 2>/dev/null; } \
       || { [ "$major" -eq 1 ] && [ "$minor" -ge 3 ]; } 2>/dev/null; then
      BUN_OK="true"
    fi
    log "Bun $BUN_VERSION at $BUN_PATH_FOUND (major=$major, minor=$minor, ok=$BUN_OK)"
  else
    log "Bun not found"
  fi
}

# --- Dependency install ---

install_deps() {
  DEPS_OK="false"

  if [ "$BUN_OK" = "false" ]; then
    log "Skipping bun install — Bun not available"
    return
  fi

  cd "$PROJECT_ROOT"

  log "Running bun install --frozen-lockfile"
  if bun install --frozen-lockfile >> "$LOG_FILE" 2>&1; then
    DEPS_OK="true"
    log "bun install succeeded"
  else
    log "bun install failed"
  fi
}

# --- Main ---

log "=== Bootstrap started ==="

detect_platform

check_bun
if [ "$BUN_OK" = "false" ]; then
  log "Bun missing or too old — running setup/install-bun.sh"
  echo "Bun not found — installing via setup/install-bun.sh"
  if bash "$PROJECT_ROOT/setup/install-bun.sh" 2>&1 | tee -a "$LOG_FILE"; then
    # Re-add the Linux curl-installer location in case install-bun.sh just
    # populated it.
    if [ -d "$HOME/.bun/bin" ]; then
      export PATH="$HOME/.bun/bin:$PATH"
    fi
    hash -r 2>/dev/null || true
    check_bun
  else
    log "install-bun.sh failed"
  fi
fi
install_deps

# Emit status block
STATUS="success"
if [ "$BUN_OK" = "false" ]; then
  STATUS="bun_missing"
elif [ "$DEPS_OK" = "false" ]; then
  STATUS="deps_failed"
fi

# Anonymous setup start event (non-blocking, best-effort). Uses the
# persisted distinct_id from data/install-id so bash-side events and the
# bun-side funnel share one id.
# Telemetry schema delta vs the prior Node-based bootstrap:
#   node_version    → bun_version
#   native_ok       → dropped (bun:sqlite is built-in, no native compile)
#   has_build_tools → dropped (no native modules to compile)
# shellcheck source=setup/lib/diagnostics.sh
source "$PROJECT_ROOT/setup/lib/diagnostics.sh"
ph_event setup_start \
  platform="$PLATFORM" \
  is_wsl="$IS_WSL" \
  is_root="$IS_ROOT" \
  bun_version="$BUN_VERSION" \
  deps_ok="$DEPS_OK" \
  status="$STATUS"

cat <<EOF
=== NANOCLAW SETUP: BOOTSTRAP ===
PLATFORM: $PLATFORM
IS_WSL: $IS_WSL
IS_ROOT: $IS_ROOT
BUN_VERSION: $BUN_VERSION
BUN_OK: $BUN_OK
BUN_PATH: ${BUN_PATH_FOUND:-not_found}
DEPS_OK: $DEPS_OK
STATUS: $STATUS
LOG: logs/setup.log
=== END ===
EOF

log "=== Bootstrap completed: $STATUS ==="

if [ "$BUN_OK" = "false" ]; then
  exit 2
fi
if [ "$DEPS_OK" = "false" ]; then
  exit 1
fi
