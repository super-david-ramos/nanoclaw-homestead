# Phase-1 voice-roundtrip demo

Proves the host has the Phase 1 voice building blocks installed and wired:

1. **TTS:** `synthesizeSpeech({text})` produces a delivery-ready OGG/Opus voice note via macOS `say` + `ffmpeg` (`src/voice/tts.ts`).
2. **STT:** `transcribeAudio({path})` runs Whisper (`whisper-cli` + `ggml-base.bin`) to recover text from audio (`src/voice/stt.ts`).
3. **Per-user voice preference:** `users.prefers_voice_replies` column exists (migration 014) and reports for the wired users.
4. **Roundtrip:** running TTS then STT against the same phrase recovers the high-confidence content words — proves both sides are functional and well-tuned for one another.

## What this demo deliberately does NOT do

- Does **not** send a real Telegram voice note. The family agent is wired to a live chat, and the demo is meant to be runnable repeatedly without spamming.
- Does **not** spawn an agent container. Voice STT/TTS run on the host per `docs/plan/decisions/03-voice.md` (Resolved 2026-05-01) — containers never see the model.
- Does **not** exercise the full delivery wiring (TTS attached to outbound based on `prefers_voice_replies`). That wiring is a Phase-1 follow-up — see the phase doc's "Reports" section.

## Prerequisites

- macOS host (the demo uses macOS `say`).
- `whisper-cpp` and `ffmpeg` from Homebrew (`brew install whisper-cpp ffmpeg`).
- Model file at `data/models/ggml-base.bin` (download with `curl -L -o data/models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`).
- nanoclaw service must have started at least once after migration 014 lands so the `users.prefers_voice_replies` column exists. If it hasn't, section 4 emits a warning instead of failing.

## How to run

```bash
bash tests/demo/phase-1/voice-roundtrip/run.sh
```

Idempotent. All work happens in a tmp dir cleaned up on exit.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Full roundtrip clean: TTS produced audio, STT recovered the words. |
| `1` | Roundtrip ran but the transcript missed expected content words — likely a model/audio quality issue. |
| `2` | Preconditions failed (missing `whisper-cli`, `ffmpeg`, `say`, or the GGML model file). |

## Expected output

See [`expected.md`](expected.md).
