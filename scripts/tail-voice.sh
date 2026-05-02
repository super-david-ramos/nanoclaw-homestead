#!/usr/bin/env bash
# Tail nanoclaw.log filtered for voice-related activity.
# Reuse: bash scripts/tail-voice.sh
exec tail -f "$(dirname "$0")/../logs/nanoclaw.log" \
  | grep --line-buffered -iE 'voice|transcribe|routed|attachment|whisper|ffmpeg'
