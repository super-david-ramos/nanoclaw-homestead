# Phase 1 — voice everywhere

**Goal:** any text channel can accept inbound voice (STT) and produce outbound voice replies (TTS) for users who opt in. Decision rationale: [decisions/03-voice.md](../decisions/03-voice.md).

**Active conventions:** [conventions.md](../conventions.md).

## Prerequisite open questions to resolve before starting

- [x] ~~**Voice models — host service or per-container?**~~ Resolved 2026-05-01: **host-side, in-process, shell-out per call** (`whisper-cli` from the host process, before `inbound.db` write). See [decisions/03-voice.md §"Resolved 2026-05-01"](../decisions/03-voice.md#resolved-2026-05-01--host-side-in-process-shell-out-per-call).
- [x] ~~**Per-user voice preference storage**~~ Resolved 2026-05-01: **new column `users.prefers_voice_replies`**, single-statement ALTER TABLE migration. Same decision doc.

## Tasks (skeleton — task out in detail when starting)

### T-1.0 `[research]` Read upstream `skill/voice-transcription` and `skill/local-whisper`

- Both are STT-only and attached to WhatsApp's media path.
- Decide: install as-is (gives WhatsApp voice in only), generalize to channel-agnostic (matches the decision intent), or fork into `skill/voice-in` (new branch).

**Output:** a one-pager appended to this phase doc with the recommendation and the per-channel surface area to modify.

### T-1.1 `[code]` Inbound STT integration on the chosen channel

TDD pairs to write before code:

- Unit tests for the STT adapter wrapper (mock Whisper, verify text payload appended to message body, audio attachment preserved).
- Integration test: end-to-end audio attachment → `messages_in` row with transcribed text + audio reference.

### T-1.2 `[code]` Outbound TTS integration

- Per-user voice preference flag (from prereq).
- Synthesize Kokoro audio at delivery time when flag is set, attach to outbound message.

TDD pairs:

- Unit tests for the TTS adapter wrapper.
- Integration test: outbound message with TTS-flagged user → delivered with attached audio.

### T-1.3 `[fork]` `skill/voice-out` branch (if outbound TTS warrants its own branch)

- Maintained by us; merge-forward CI mirroring upstream's `skill/*` pattern.

## Demo (Phase 1 wrap)

Demo path: `tests/demo/phase-1/voice-roundtrip/`

Demonstrates: send a Telegram voice note → agent response includes transcript reference → user has voice flag set → outbound voice reply delivered.

## Phase 1 done = all of:

- [ ] Open questions #2 and #3 resolved
- [ ] T-1.0 research output appended
- [ ] T-1.1 inbound STT (TDD pairs + integration test)
- [ ] T-1.2 outbound TTS (TDD pairs + integration test)
- [ ] T-1.3 if applicable
- [ ] Demo runs green
- [ ] Completion reports filed

## Reports

<!-- Append per conventions.md when tasks close. -->

## T-1.0 research output {#t-10-research-output}

**Closed:** 2026-05-01

**Branch availability.** Neither `upstream/skill/voice-transcription` nor `upstream/skill/local-whisper` exists on the `qwibitai/nanoclaw` (`upstream`) remote. The actual code lives on a separate v1 fork: `qwibitai/nanoclaw-whatsapp`, branches `skill/voice-transcription` and `skill/local-whisper`. The skill *markdown files only* (`SKILL.md`) live on `upstream/skill/native-credential-proxy` at `.claude/skills/{add-voice-transcription,use-local-whisper}/`. Both target **v1 nanoclaw** — single-process, monolithic — and have not been ported to v2.

**v1 hook point** (for reference; not directly applicable to v2). `src/channels/whatsapp.ts` inside `messages.upsert`: after computing `content`, the diff calls `isVoiceMessage(msg)` (Baileys-specific `audioMessage.ptt === true` check), then `await transcribeAudioMessage(msg, this.sock)`, and rewrites `finalContent = "[Voice: <transcript>]"` before `opts.onMessage(...)`. New module: `src/transcription.ts` (~98 lines). Per-call `execFile('whisper-cli', ['-m', model, '-f', wav, '--no-timestamps', '-nt'])` after `ffmpeg` normalizes Opus → 16 kHz mono WAV.

**Dependencies that the upstream branches add.** `voice-transcription`: `openai` npm pkg + `OPENAI_API_KEY`. `local-whisper`: drops `openai`, shells out to `whisper-cli` (Homebrew `whisper-cpp`) + `ffmpeg`, plus a GGML model file at `data/models/ggml-base.bin` (~150 MB; `small` ~470 MB; `medium` ~1.5 GB).

**Resource footprint on Mac M2 / 8 GB.** `ggml-base` ≈ 200–300 MB resident during inference, ~1 s wall per 30 s of audio on M1+ per the SKILL note. Comfortably fits in 8 GB at idle alongside Docker + per-session containers. `small` would be tight; `medium`/`large` would not work co-resident.

**Channel coupling — heavy in v1.** Both v1 branches are 100% WhatsApp/Baileys. `transcription.ts` imports `WAMessage`, `WASocket`, `downloadMediaMessage` directly. The hook lives inside the WhatsApp message loop. Generalizing means:

1. Move audio acquisition into each adapter (Telegram = `getFile`/voice MIME, iMessage = attachment file path, Discord = attachment URL).
2. Define a channel-agnostic `AudioAttachment{buffer|path, mimeType}` shape.
3. Make `transcribe(audio): string` consume that.
4. Decide where in v2 the hook lives. Most natural: in each channel adapter, before it writes to `inbound.db.messages_in`. v2 already downloads audio attachments to `data/attachments/` and ships them as a separate `attachments[]` array (see `upstream/channels:src/channels/whatsapp.ts:290–333`), so v1's "rewrite content as `[Voice: ...]`" is no longer the right shape — instead, attach the transcript as a structured field on the attachment.

**Recommendation: build fresh in this fork; do NOT install upstream as-is.**

Rationale:

1. The upstream branches don't exist on `upstream`, only on the v1 WhatsApp fork repo — pulling them touches a different remote (`qwibitai/nanoclaw-whatsapp`) and pulls in v1 channel scaffolding that conflicts with v2's container-DB architecture.
2. Homestead targets multi-channel voice (Telegram first per Phase 0/1), so a WhatsApp-only install delivers nothing now.
3. The v1 hook style (rewriting text content) is wrong for v2's attachments-and-DB pipeline.

**What we borrow from upstream**: the `whisper-cli` + `ffmpeg` shell-out pattern (`local-whisper`'s ~50-line `transcribeWithWhisperCpp`), the `WHISPER_BIN` / `WHISPER_MODEL` env knobs, the `ggml-base.bin` default, and the temp-file cleanup pattern.

**What we build fresh**: a channel-agnostic `transcribeAudio({buffer|path, mime}): Promise<string>` in `src/voice/stt.ts` (host-side), invoked by Telegram (and any future adapter) before the `inbound.db` write, attaching the transcript as a structured field rather than rewriting `text`.

**Gotchas surfaced for the install + run.**

- Brew formula installs the binary as `whisper-cli`, not `whisper`. Easy to mis-document.
- launchd plist `PATH` must include `/opt/homebrew/bin` or the service can't find `whisper-cli`/`ffmpeg`. Works fine in `pnpm run dev` shell, fails as a service. Replicate the SKILL.md check.
- `ffmpeg` is mandatory — Telegram/Baileys voice are Opus-in-OGG; whisper.cpp wants 16 kHz mono WAV.
- No CGO / native build needed — `whisper-cpp` brew bottle is precompiled with Metal acceleration on Apple Silicon.
- Execution path: STT runs **on the host**, not inside agent containers. The container Bun image has neither `whisper-cli` nor `ffmpeg`, and adding them would fight per-session container spawn cost. Host-side preprocessing matches the "container only sees text" v2 invariant.
- Per-call subprocess (no daemon) is fine for one voice note; serializes if multiple arrive in parallel — not an issue at homestead scale (single household, 8 GB Mac), but flag for the completion report.
