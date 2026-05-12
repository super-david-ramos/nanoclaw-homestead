#!/usr/bin/env bash
#
# scratch-fresh-install.sh — Verbose smoke for the bun installer rewrite.
#
# Simulates a "fresh clone, no node_modules, bun already installed" install
# without touching the live checkout's working tree, node_modules, logs/, or
# the launchd-managed nanoclaw service. Runs `bash setup.sh` standalone
# inside a mktemp clone so the bash → ts handoff (`exec bun run setup:auto`)
# in nanoclaw.sh stays out of scope (it boots an interactive @clack/prompts
# wizard that would overwrite live state).
#
# What it covers:
#   - install-bun.sh standalone, already-installed branch
#   - setup.sh: detect_platform, check_bun, install_deps, status block,
#     telemetry schema (bun_version), exit code 0
#   - probe.sh: HOST_DEPS marker after install
#   - parsed STATUS == success
#   - node_modules/.bin populated post-install
#
# What it does NOT cover (filed for later):
#   - The Linux curl-installer branch of install-bun.sh (needs a Linux
#     container or VM where bun is genuinely absent)
#   - The full nanoclaw.sh chain end-to-end (interactive handoff)
#   - The Mac Mini fresh-machine path (no laptop substitute possible)
#
# Usage:
#   bash tests/demo/installer-bun/scratch-fresh-install.sh         # default: cleans up
#   bash tests/demo/installer-bun/scratch-fresh-install.sh --keep  # leave scratch dir
#
# Exit:
#   0 — every assertion passed
#   1 — at least one assertion failed (look at the FAIL lines)

set -uo pipefail

# ─── flags ──────────────────────────────────────────────────────────────

KEEP_SCRATCH="false"
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP_SCRATCH="true" ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

# ─── output helpers (mirror nanoclaw.sh's clack-alike palette) ─────────

use_ansi() { [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; }
dim()   { use_ansi && printf '\033[2m%s\033[0m'  "$1" || printf '%s' "$1"; }
gray()  { use_ansi && printf '\033[90m%s\033[0m' "$1" || printf '%s' "$1"; }
green() { use_ansi && printf '\033[32m%s\033[0m' "$1" || printf '%s' "$1"; }
red()   { use_ansi && printf '\033[31m%s\033[0m' "$1" || printf '%s' "$1"; }
yellow(){ use_ansi && printf '\033[33m%s\033[0m' "$1" || printf '%s' "$1"; }
bold()  { use_ansi && printf '\033[1m%s\033[0m'  "$1" || printf '%s' "$1"; }

section() {
  printf '\n%s %s\n' "$(bold "==")" "$(bold "$1")"
  printf '%s\n' "$(dim "$(printf '%.0s─' $(seq 1 60))")"
}

step() { printf '%s %s\n' "$(gray '◆')" "$1"; }
info() { printf '%s %s\n' "$(gray '·')" "$(dim "$1")"; }
pass() { printf '%s %s\n' "$(green '✓')" "$1"; }
fail() { printf '%s %s\n' "$(red   '✗')" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn() { printf '%s %s\n' "$(yellow '!')" "$1"; }

FAIL_COUNT=0

# ─── pre-flight ────────────────────────────────────────────────────────

section "Pre-flight"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
info "Repo root: $REPO_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  fail "bun not on PATH. Install bun first: bash setup/install-bun.sh"
  exit 1
fi
pass "bun present at $(command -v bun) ($(bun --version))"

if ! command -v git >/dev/null 2>&1; then
  fail "git not on PATH"
  exit 1
fi
pass "git present at $(command -v git)"

CURRENT_BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "unknown")
info "Current branch in repo: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "feat/host-bun-migration" ]; then
  warn "Branch is not feat/host-bun-migration; this script clones whatever HEAD is."
fi

# ─── standalone install-bun.sh (already-installed branch) ──────────────

section "Stage 1 — install-bun.sh idempotent on already-installed bun"

step "Running: bash setup/install-bun.sh"
INSTALL_BUN_OUT=$(bash "$REPO_ROOT/setup/install-bun.sh" 2>&1)
INSTALL_BUN_RC=$?

printf '%s\n' "$INSTALL_BUN_OUT" | sed 's/^/   /'

if [ "$INSTALL_BUN_RC" -ne 0 ]; then
  fail "install-bun.sh exited $INSTALL_BUN_RC (expected 0)"
elif ! printf '%s\n' "$INSTALL_BUN_OUT" | grep -q '^STATUS: already-installed$'; then
  fail "install-bun.sh did not emit 'STATUS: already-installed'"
elif ! printf '%s\n' "$INSTALL_BUN_OUT" | grep -q '^BUN_VERSION: '; then
  fail "install-bun.sh did not emit 'BUN_VERSION: …'"
else
  pass "install-bun.sh idempotent (STATUS=already-installed, BUN_VERSION present)"
fi

# ─── scratch clone ─────────────────────────────────────────────────────

section "Stage 2 — Fresh clone in scratch dir, no node_modules"

SCRATCH=$(mktemp -d -t nanoclaw-installer-scratch.XXXXXX)
SCRATCH_REPO="$SCRATCH/nanoclaw"
info "Scratch dir: $SCRATCH"

trap '
  if [ "$KEEP_SCRATCH" = "true" ]; then
    printf "\n%s Scratch dir preserved at: %s\n" "$(yellow "!")" "$SCRATCH"
  elif [ -d "$SCRATCH" ]; then
    rm -rf "$SCRATCH"
  fi
' EXIT

step "Cloning $REPO_ROOT (branch: $CURRENT_BRANCH) into $SCRATCH_REPO"
if git clone --quiet --branch "$CURRENT_BRANCH" "$REPO_ROOT" "$SCRATCH_REPO" 2>&1 \
     | sed 's/^/   /'; then
  pass "Clone OK"
else
  fail "Clone failed"
  exit 1
fi

cd "$SCRATCH_REPO"

step "Verifying scratch clone has no node_modules"
if [ -e "$SCRATCH_REPO/node_modules" ]; then
  fail "Scratch clone unexpectedly contains node_modules — expected absent"
  ls -la "$SCRATCH_REPO/node_modules" | head -3 | sed 's/^/   /'
else
  pass "node_modules absent (clean slate confirmed)"
fi

step "Verifying expected files are present"
for f in setup.sh setup/install-bun.sh setup/probe.sh nanoclaw.sh package.json bun.lock .bun-version; do
  if [ -e "$SCRATCH_REPO/$f" ]; then
    pass "  $f present"
  else
    fail "  $f MISSING"
  fi
done

step "Verifying setup/install-node.sh deleted (T-I.6)"
if [ -e "$SCRATCH_REPO/setup/install-node.sh" ]; then
  fail "  install-node.sh still on disk (T-I.6 regression — should be deleted)"
else
  pass "  install-node.sh deleted"
fi

step "Verifying scripts have a bash shebang and are readable"
for f in setup.sh setup/install-bun.sh setup/probe.sh nanoclaw.sh; do
  shebang=$(head -1 "$SCRATCH_REPO/$f")
  if [[ "$shebang" =~ ^#!/.*bash ]]; then
    pass "  $f: $shebang"
  else
    fail "  $f: shebang missing or wrong → '$shebang'"
  fi
done

# ─── grep gates: no leftover Node + pnpm refs in the bootstrap chain ──

section "Stage 3 — Grep gates: bootstrap chain free of Node + pnpm"

BOOTSTRAP_CHAIN=(
  "$SCRATCH_REPO/setup.sh"
  "$SCRATCH_REPO/setup/install-bun.sh"
  "$SCRATCH_REPO/setup/probe.sh"
  "$SCRATCH_REPO/nanoclaw.sh"
)

# These patterns must NOT appear in the bootstrap chain. Comments inside
# the new setup.sh that name the OLD scheme as a delta marker are tolerated
# only if they appear inside the file's own delta-comment block.
declare -a FORBIDDEN=(
  'pnpm install'
  'pnpm exec'
  'pnpm run'
  'pnpm --silent'
  'tsx '
  'better-sqlite3'
  'node_modules/better-sqlite3'
)

for pat in "${FORBIDDEN[@]}"; do
  hits=$(grep -nE "$pat" "${BOOTSTRAP_CHAIN[@]}" 2>/dev/null \
           | grep -vE 'Telemetry schema delta vs the prior Node-based bootstrap' \
           || true)
  if [ -z "$hits" ]; then
    pass "  no '$pat' in bootstrap chain"
  else
    fail "  '$pat' still appears in bootstrap chain:"
    printf '%s\n' "$hits" | sed 's/^/        /'
  fi
done

step "Verifying nanoclaw.sh handoff line is bun-based"
if grep -q '^exec bun run --silent setup:auto$' "$SCRATCH_REPO/nanoclaw.sh"; then
  pass "  nanoclaw.sh ends with 'exec bun run --silent setup:auto'"
else
  fail "  nanoclaw.sh handoff line not updated"
  grep -n '^exec ' "$SCRATCH_REPO/nanoclaw.sh" | sed 's/^/      /' || true
fi

step "Verifying package.json has no pnpm packageManager field"
if grep -qE '"packageManager":[[:space:]]*"pnpm@' "$SCRATCH_REPO/package.json"; then
  fail "  package.json still pins pnpm in packageManager"
else
  pass "  package.json has no pnpm packageManager pin"
fi

step "Verifying .bun-version matches engines.bun"
BUN_VERSION_FILE=$(cat "$SCRATCH_REPO/.bun-version" 2>/dev/null | tr -d '[:space:]')
ENGINES_BUN=$(grep -E '"bun"' "$SCRATCH_REPO/package.json" \
                | sed -E 's/.*"bun":[[:space:]]*"([^"]+)".*/\1/')
info ".bun-version file says: $BUN_VERSION_FILE"
info "package.json engines.bun says: $ENGINES_BUN"
if [ -n "$BUN_VERSION_FILE" ] && [ -n "$ENGINES_BUN" ]; then
  pass "  both pins present (parity check is loose: $BUN_VERSION_FILE vs $ENGINES_BUN)"
else
  fail "  one or both pins missing"
fi

# ─── run setup.sh inside scratch clone ─────────────────────────────────

section "Stage 4 — bash setup.sh in scratch clone"

step "Running: bash setup.sh (this runs 'bun install --frozen-lockfile' against scratch dir)"

# Capture stdout+stderr but also echo to console (verbose) so the user sees
# the spinner-equivalent progress. tee to a temp log so we can grep the
# status block deterministically afterwards.
SETUP_LOG="$SCRATCH/setup.out"
if bash setup.sh 2>&1 | tee "$SETUP_LOG" | sed 's/^/   /'; then
  SETUP_RC=0
else
  SETUP_RC=$?
fi

if [ "$SETUP_RC" -eq 0 ]; then
  pass "setup.sh exited 0"
else
  fail "setup.sh exited $SETUP_RC (expected 0)"
fi

# Status block parse — these are the *new* (post-T-I.2) field names.
STATUS_BLOCK_FOUND="false"
if grep -q '^=== NANOCLAW SETUP: BOOTSTRAP ===$' "$SETUP_LOG" \
   && grep -q '^=== END ===$' "$SETUP_LOG"; then
  STATUS_BLOCK_FOUND="true"
fi

if [ "$STATUS_BLOCK_FOUND" = "true" ]; then
  pass "Status block emitted (NANOCLAW SETUP: BOOTSTRAP … === END ===)"
else
  fail "Status block not found in setup.sh output"
fi

grep_field() {
  grep -E "^$1: " "$SETUP_LOG" | tail -1 | sed -E "s/^$1: //"
}

PLATFORM=$(grep_field PLATFORM)
BUN_VERSION_PARSED=$(grep_field BUN_VERSION)
BUN_OK=$(grep_field BUN_OK)
DEPS_OK=$(grep_field DEPS_OK)
STATUS=$(grep_field STATUS)

step "Parsed status block fields"
info "  PLATFORM:    $PLATFORM"
info "  BUN_VERSION: $BUN_VERSION_PARSED"
info "  BUN_OK:      $BUN_OK"
info "  DEPS_OK:     $DEPS_OK"
info "  STATUS:      $STATUS"

[ "$BUN_OK"   = "true"    ] && pass "  BUN_OK   == true"     || fail "  BUN_OK   != true"
[ "$DEPS_OK"  = "true"    ] && pass "  DEPS_OK  == true"     || fail "  DEPS_OK  != true"
[ "$STATUS"   = "success" ] && pass "  STATUS   == success"  || fail "  STATUS   != success"
[ -n "$BUN_VERSION_PARSED" ] && pass "  BUN_VERSION non-empty" || fail "  BUN_VERSION empty"

# Telemetry schema sanity: the OLD fields must be GONE; the NEW field must
# be present. setup.sh's status block is the proxy here.
step "Verifying old field names are gone"
for old_field in NODE_VERSION NODE_OK NODE_PATH NATIVE_OK HAS_BUILD_TOOLS; do
  if grep -qE "^$old_field:" "$SETUP_LOG"; then
    fail "  $old_field still present (should be gone)"
  else
    pass "  $old_field absent"
  fi
done

step "Verifying node_modules/.bin populated post-install"
if [ -d "$SCRATCH_REPO/node_modules/.bin" ] \
   && [ "$(ls -A "$SCRATCH_REPO/node_modules/.bin" 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
  count=$(ls "$SCRATCH_REPO/node_modules/.bin" | wc -l | tr -d ' ')
  pass "  node_modules/.bin populated ($count shims)"
else
  fail "  node_modules/.bin missing or empty"
fi

# ─── probe.sh inside the now-installed scratch clone ───────────────────

section "Stage 5 — probe.sh inside installed scratch clone"

step "Running: bash setup/probe.sh"
PROBE_LOG="$SCRATCH/probe.out"
bash "$SCRATCH_REPO/setup/probe.sh" 2>&1 | tee "$PROBE_LOG" | sed 's/^/   /'

HOST_DEPS_PROBE=$(grep -E '^HOST_DEPS:' "$PROBE_LOG" | tail -1 | sed -E 's/^HOST_DEPS: //')
OS_PROBE=$(grep -E '^OS:' "$PROBE_LOG" | tail -1 | sed -E 's/^OS: //')

info "Parsed: OS=$OS_PROBE, HOST_DEPS=$HOST_DEPS_PROBE"

[ "$HOST_DEPS_PROBE" = "ok" ] && pass "probe.sh: HOST_DEPS == ok" \
                              || fail "probe.sh: HOST_DEPS != ok (got '$HOST_DEPS_PROBE')"

[ -n "$OS_PROBE" ] && pass "probe.sh: OS detected ($OS_PROBE)" \
                   || fail "probe.sh: OS not detected"

# ─── final report ──────────────────────────────────────────────────────

section "Result"

if [ "$FAIL_COUNT" -eq 0 ]; then
  printf '%s %s\n' "$(green '✓')" "$(bold "ALL CHECKS PASSED")"
  printf '\n%s\n' "$(dim 'Bootstrap chain is internally consistent for the bun-installed case.')"
  printf '%s\n' "$(dim 'Linux curl-install branch + Mac Mini fresh-machine end-to-end NOT covered.')"
  exit 0
else
  printf '%s %s\n' "$(red '✗')" "$(bold "$FAIL_COUNT CHECK(S) FAILED")"
  printf '\n%s\n' "$(dim 'Scroll up for FAIL lines.')"
  if [ "$KEEP_SCRATCH" != "true" ]; then
    printf '%s\n' "$(dim 'Re-run with --keep to inspect the scratch dir afterwards.')"
  fi
  exit 1
fi
