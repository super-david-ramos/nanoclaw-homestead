#!/usr/bin/env bash
# Setup helper: install-bun — bundles Bun install into one idempotent
# script so /new-setup can run it without needing `curl | bash` in the
# allowlist (that pattern is inherently unmatchable — bash reads from
# stdin, so pre-approval can't inspect what's being executed).
#
# The script itself is the allowlisted unit; the pipes live inside it.
# Pure bash by design — runs before Bun exists on the host.
#
# macOS: brew install oven-sh/bun/bun  (relies on brew pre-flight in nanoclaw.sh)
# Linux: curl -fsSL https://bun.sh/install | bash  (drops binary at ~/.bun/bin/bun)
set -euo pipefail

echo "=== NANOCLAW SETUP: INSTALL_BUN ==="

# Add the Linux curl-installer's default location to PATH for this script
# so an existing `~/.bun/bin/bun` from a prior run is detected as installed.
if [ -d "$HOME/.bun/bin" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi

if command -v bun >/dev/null 2>&1; then
  echo "STATUS: already-installed"
  echo "BUN_VERSION: $(bun --version)"
  echo "BUN_PATH: $(command -v bun)"
  echo "=== END ==="
  exit 0
fi

case "$(uname -s)" in
  Darwin)
    echo "STEP: brew-install-bun"
    if ! command -v brew >/dev/null 2>&1; then
      echo "STATUS: failed"
      echo "ERROR: Homebrew not installed. Install brew first (https://brew.sh) then re-run."
      echo "=== END ==="
      exit 1
    fi
    brew install oven-sh/bun/bun
    ;;
  Linux)
    echo "STEP: curl-install-bun"
    # Official installer drops bun at ~/.bun/bin/bun and appends an export to
    # the user's shell profile. Subprocess PATH mutation doesn't propagate to
    # our caller, so the caller (setup.sh) re-checks ~/.bun/bin after this
    # script returns.
    curl -fsSL https://bun.sh/install | bash
    if [ -d "$HOME/.bun/bin" ]; then
      export PATH="$HOME/.bun/bin:$PATH"
    fi
    ;;
  *)
    echo "STATUS: failed"
    echo "ERROR: Unsupported platform: $(uname -s)"
    echo "=== END ==="
    exit 1
    ;;
esac

if ! command -v bun >/dev/null 2>&1; then
  echo "STATUS: failed"
  echo "ERROR: bun not found on PATH after install"
  echo "=== END ==="
  exit 1
fi

echo "STATUS: installed"
echo "BUN_VERSION: $(bun --version)"
echo "BUN_PATH: $(command -v bun)"
echo "=== END ==="
