#!/usr/bin/env bash
# Phase-1 wrap demo — proves the voice-everywhere building blocks exist
# and survive a self-contained synthetic roundtrip on the host.
#
# What it does:
#   1. Synthesize a phrase to speech with macOS `say` + `ffmpeg` → OGG/Opus.
#   2. Pipe that audio back through Whisper (whisper-cli + ggml-base.bin).
#   3. Compare the round-tripped transcript against the original phrase.
#
# What it does NOT do:
#   - Send a real Telegram voice note (would post in your live family chat).
#   - Spawn an agent container.
#   - Exercise the per-user prefers_voice_replies + delivery wiring (that
#     wiring is a Phase-1 follow-up — see phase-1-voice.md "Reports").
#
# The Telegram-side STT integration is exercised by the existing chat-sdk
# bridge tests + the next live voice-note exchange in your wired chat.
#
# Idempotent: writes only into a tmp dir, cleaned up on exit.
#
# Exit codes:
#   0 — full STT+TTS roundtrip works on this host
#   1 — roundtrip ran but the transcript didn't recognize the original
#   2 — preconditions failed (whisper-cli, ffmpeg, say, or the model file
#       are not available)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"

PHRASE="Hello world this is the family agent."

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
header() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

# ---- preconditions ----

header "0. Preconditions"
for cmd in say ffmpeg whisper-cli; do
  if command -v "$cmd" >/dev/null 2>&1; then
    green "✓ $cmd: $(command -v "$cmd")"
  else
    red "✗ $cmd not on PATH"
    exit 2
  fi
done

MODEL="${WHISPER_MODEL:-data/models/ggml-base.bin}"
if [[ ! -f "$MODEL" ]]; then
  red "✗ whisper model missing at $MODEL"
  yellow "  download via:"
  yellow "  curl -L -o $MODEL https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
  exit 2
fi
green "✓ model: $MODEL"

# ---- 1. TTS via the Phase-1 module ----

header "1. Synthesize phrase to OGG/Opus"

TMP="$(mktemp -d -t nanoclaw-voice-roundtrip)"
trap 'rm -rf "$TMP"' EXIT

OGG_PATH="$(pnpm exec tsx tests/demo/phase-1/voice-roundtrip/synth.ts "$PHRASE" "$TMP" 2>/dev/null)"

if [[ ! -f "$OGG_PATH" ]]; then
  red "✗ synthesizeSpeech did not produce a file"
  exit 1
fi
size="$(wc -c < "$OGG_PATH")"
green "✓ wrote $OGG_PATH ($size bytes)"

# ---- 2. STT via the Phase-1 module ----

header "2. Transcribe the synthesized clip"

TRANSCRIPT="$(pnpm exec tsx tests/demo/phase-1/voice-roundtrip/transcribe.ts "$OGG_PATH" 2>/dev/null)"

if [[ -z "$TRANSCRIPT" ]]; then
  red "✗ transcribeAudio returned empty text"
  exit 1
fi
green "✓ transcript: $TRANSCRIPT"

# ---- 3. Sanity-check the roundtrip ----

header "3. Compare original vs roundtripped"

# High-confidence content words; ignore casing, punctuation, articles.
needles=(hello world family agent)
echo "  original:    $PHRASE"
echo "  transcribed: $TRANSCRIPT"

lower="$(printf '%s' "$TRANSCRIPT" | tr '[:upper:]' '[:lower:]')"
missing=()
for n in "${needles[@]}"; do
  if [[ "$lower" != *"$n"* ]]; then
    missing+=("$n")
  fi
done

if (( ${#missing[@]} == 0 )); then
  green "✓ all expected content words appear in the transcript"
else
  red "✗ missing words from transcript: ${missing[*]}"
  yellow "  (Whisper occasionally drops words on very short clips — try a"
  yellow "   longer phrase or check the audio file at $OGG_PATH)"
  exit 1
fi

# ---- 4. Per-user voice preference column ----

header "4. users.prefers_voice_replies column"

if [[ -f data/v2.db ]]; then
  has_col="$(sqlite3 data/v2.db "PRAGMA table_info('users')" | grep -c prefers_voice_replies || true)"
  if [[ "$has_col" -ge 1 ]]; then
    green "✓ column present (migration 014 applied)"
    sqlite3 -header -column data/v2.db "
      SELECT id, kind, display_name, prefers_voice_replies
      FROM users ORDER BY created_at LIMIT 5
    "
  else
    yellow "⚠ column missing — host hasn't restarted to apply migration 014 yet"
  fi
else
  yellow "⚠ no central DB at data/v2.db — host has never run"
fi

# ---- summary ----

header "Summary"
green "✓ Phase-1 voice building blocks roundtrip clean: TTS → STT recovers the spoken content."
yellow "  Owed for full Phase-1 close (see docs/plan/phases/phase-1-voice.md):"
yellow "    - Wire TTS into delivery layer (per-user prefers_voice_replies → outbound voice note)"
yellow "    - Live test: Telegram voice note in → agent transcript visible in inbound.db"
yellow "    - Live test: Telegram outbound voice note attached when user opted in"
exit 0
