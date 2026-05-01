# Expected output — voice-roundtrip demo

Five sections, each starting with `=== <n>. <title> ===`. Green `✓` = ok; yellow `⚠` = passes but worth knowing; red `✗` = fail (non-zero exit).

## Good output

```
=== 0. Preconditions ===
✓ say: /usr/bin/say
✓ ffmpeg: /opt/homebrew/bin/ffmpeg
✓ whisper-cli: /opt/homebrew/bin/whisper-cli
✓ model: data/models/ggml-base.bin

=== 1. Synthesize phrase to OGG/Opus ===
✓ wrote /tmp/.../out-NNN.ogg (~5–8 KB)

=== 2. Transcribe the synthesized clip ===
✓ transcript: Hello World, this is the Family Agent.
  (whisper may add commas / capitalize differently — content matters, not formatting)

=== 3. Compare original vs roundtripped ===
  original:    Hello world this is the family agent.
  transcribed: Hello World, this is the Family Agent.
✓ all expected content words appear in the transcript

=== 4. users.prefers_voice_replies column ===
✓ column present (migration 014 applied)
  (if no users in the central DB yet, the SELECT block prints headers only — that's fine)

=== Summary ===
✓ Phase-1 voice building blocks roundtrip clean: TTS → STT recovers the spoken content.
  Owed for full Phase-1 close (see docs/plan/phases/phase-1-voice.md):
    - Wire TTS into delivery layer (per-user prefers_voice_replies → outbound voice note)
    - Live test: Telegram voice note in → agent transcript visible in inbound.db
    - Live test: Telegram outbound voice note attached when user opted in
```

Exit code: `0`.

## Things that look like problems but aren't

- **`⚠ column missing — host hasn't restarted to apply migration 014 yet`.** First run after pulling Phase 1: the launchd-managed service still has the old DB schema in its connection. Restart with `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` and re-run; the warning becomes a `✓`.
- **Transcript adds capitalization or commas the original doesn't have.** Whisper does light formatting; we only assert content words, not byte-for-byte equality.
- **Audio file size varies between runs.** OGG/Opus is variable-bitrate; ~5–8 KB for a one-sentence phrase is normal.

## Things that should fail the demo

- **A precondition `✗`.** The script exits 2 at the first missing tool. Install `whisper-cpp`/`ffmpeg` via brew or download the model.
- **Empty transcript or missing content words.** Likely indicates a corrupt model file, a damaged audio output, or — on a much shorter / quieter test phrase — that Whisper's `base` model didn't pick it up. Try lengthening the phrase or stepping up to `ggml-small.bin`.
