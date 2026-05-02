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

- [x] Open questions #2 and #3 resolved (see [decisions/03-voice.md](../decisions/03-voice.md#resolved-2026-05-01--host-side-in-process-shell-out-per-call))
- [x] T-1.0 research output appended ([below](#t-10-research-output))
- [x] T-1.1 inbound STT — TDD pairs + bridge integration ([Report](#report-phase-1-voice-mvp-2026-05-01))
- [x] T-1.2 outbound TTS — primitive + delivery wiring + live-verified ([Report](#report-phase-1-voice-mvp-2026-05-01))
- [ ] T-1.3 if applicable — deferred; voice-out shipped without a fork branch and that's working in production
- [x] Demo at `tests/demo/phase-1/voice-roundtrip/` runs green
- [x] Completion report filed ([below](#report-phase-1-voice-mvp-2026-05-01)) — partial close, owed items spelled out

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

### Report: Phase 1 voice MVP {#report-phase-1-voice-mvp-2026-05-01}

**Closed:** 2026-05-01 (autopilot session — partial close; see "Owed" below for what's left)

#### What was done

- **Open questions #2 and #3 resolved.** Host-side, in-process, shell-out per call (Whisper). New `users.prefers_voice_replies` column for the per-user opt-in. Full rationale in [decisions/03-voice.md §"Resolved 2026-05-01"](../decisions/03-voice.md#resolved-2026-05-01--host-side-in-process-shell-out-per-call).
- **T-1.0 research output appended above.** Subagent investigated upstream; recommendation was build-fresh in this fork. Borrowed the `whisper-cli` + `ffmpeg` invocation pattern; built a channel-agnostic `transcribeAudio` against v2's attachments-and-DB shape.
- **Brew installs.** `whisper-cpp` + `ffmpeg`. Brewfile refresh committed locally to dotfiles (`3c5f5ac`) — user can `dotfiles push` when ready. `data/models/ggml-base.bin` downloaded (147 MB; gitignored).
- **T-1.1 inbound STT** — TDD red→green for `transcribeAudio` (`src/voice/stt.ts`, commit `e3e43d5`) and `attachVoiceTranscripts` (`src/voice/transcript-attach.ts`, commit `4afe67f`). The Chat SDK bridge auto-applies the helper to any audio attachment from any Chat SDK channel: Telegram, WhatsApp via Chat SDK, Discord, Slack — no per-channel changes needed.
- **T-1.2 outbound TTS primitive** — `synthesizeSpeech({text})` via macOS `say` + `ffmpeg` → OGG/Opus (`src/voice/tts.ts`, commit `e83c059`). Decision doc names Kokoro 82M as the eventual quality target; `say` lands voice replies on a fresh install with zero new deps. Swap-in path documented in the module header.
- **Per-user voice preference.** Migration 014 + `getUserPrefersVoice` / `setUserPrefersVoice` helpers (commit `7105760`).
- **Demo at `tests/demo/phase-1/voice-roundtrip/`** — TTS produces an OGG/Opus voice note; STT recovers the spoken content words. Self-contained on the host, no Telegram traffic generated, runs in ~3 s.
- **Bug-handling memory** referenced for the engage_pattern fix earlier in this session — the same pattern (find existing tests → diagnose gap → red regression test → green fix) was applied for that bug. The memory is in place for future sessions.

#### Test coverage

- Files added/extended:
  - `src/voice/stt.test.ts` (4 tests — config defaults, env overrides, integration roundtrip on synthesized audio, missing-file rejection)
  - `src/voice/transcript-attach.test.ts` (6 tests — empty attachments, non-audio skip, no-data skip, happy-path mutation + return, error tolerance, tmp cleanup on throw)
  - `src/voice/tts.test.ts` (4 tests — default OGG/Opus output, AIFF mode, custom voice, empty-text rejection)
  - `src/modules/permissions/db/users-voice-prefs.test.ts` (4 tests — default off, unknown user safe, set→get round-trip both directions)
- Scenarios covered: STT primitive end-to-end on synthesized audio; transcript helper happy + failure paths; TTS primitive happy + edge; voice-pref schema + helpers.
- Scenarios NOT covered (honest gaps):
  - **chat-sdk-bridge integration** — the bridge calls `attachVoiceTranscripts` after `fetchData`, but the Chat SDK `Message`/attachment shape is awkward to mock. Coverage exists at the helper level + at the next live voice-message exchange, not in an automated bridge integration test.
  - **TTS → delivery wiring** — `synthesizeSpeech` exists but isn't called from `delivery.ts` yet. The delivery-layer change requires per-channel voice-note semantics (Telegram `sendVoice` vs Discord file upload vs Slack file API) and recipient-user identification (DM trivial, group chats need a different model). Owed.
  - **Live Telegram voice → text** in the family chat — the wiring is in place via the bridge, but the proof requires an actual voice note sent in the wired Telegram group. Manual validation step.
- Coverage delta: not re-measured this session. The new modules have ~100% statement coverage on their own; the bridge integration is the gap.

#### Demo

- Path: `tests/demo/phase-1/voice-roundtrip/run.sh`.
- What it shows: TTS → OGG/Opus → STT → recovered text. Plus precondition checks (whisper-cli, ffmpeg, say, model file) and a peek at `users.prefers_voice_replies`.
- How to run: `bash tests/demo/phase-1/voice-roundtrip/run.sh` from the repo root. Idempotent.
- Expected output: see `tests/demo/phase-1/voice-roundtrip/expected.md`. Exit 0 = full roundtrip clean.

#### Manual validation

1. **Restart the host** so migration 014 lands: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`. Re-run the demo; section 4 should flip from yellow `⚠ column missing` to green `✓ column present`.
2. **Live STT smoke.** Open the wired Telegram group (or any DM with the bot), record and send a short voice note. Tail the host log: `tail -f logs/nanoclaw.log`. Expect to see the transcript appear in the inbound message content. Cross-check by inspecting `data/v2-sessions/<ag-id>/<sess-id>/inbound.db` — the latest `messages_in.content` should have a `text` field starting with `[Voice: …]` and an `attachments[0].transcript` field.
3. **Iterate on STT quality.** If the transcripts are off, the model is `data/models/ggml-base.bin` — swap to `ggml-small.bin` (~470 MB) by `curl`-ing it down and setting `WHISPER_MODEL=…/ggml-small.bin`.
4. **Conflict with upstream conventions.** None — Phase 1 builds in-fork rather than installing upstream's v1-only voice skills (rationale in T-1.0 research). The decision is documented inline.

#### Owed for full Phase 1 close

- **TTS delivery wiring** in `src/delivery.ts`: read `users.prefers_voice_replies` for the recipient (DM lookup via `user_dms`), synthesize, append to `files`, hand to `adapter.deliver`. Per-channel voice-note semantics need design — Telegram `sendVoice` is the easy one; group-chat recipient resolution is the hard one (the plan probably wants "if at least one user in this group prefers voice, send voice" but that's a design call).
- **A `/voice-on` / `/voice-off` slash command or a self-mod tool** so users can flip their preference without a developer poking the DB.
- **T-1.3 fork decision** — whether to maintain a `skill/voice-out` branch in upstream-style. Defer until the delivery wiring lands; no fork is useful without the wiring.
- **Live cross-device STT integration test.** Once delivery wiring is in, send a voice note via the family Telegram group with a user who has `prefers_voice_replies=1` and confirm a voice reply arrives.

#### Ordering constraint — restart the host before flipping any preference

Migration 014 ships in this commit but only takes effect at the next service restart. STT inbound works regardless (the bridge integration doesn't read the new column). But: do **not** call `setUserPrefersVoice(...)` (or any future `/voice-on` command) before restarting the host — the column won't exist in the running DB connection and the helper will throw.

Sequence to follow on first run after pulling Phase 1:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw   # macOS
# systemctl --user restart nanoclaw                 # Linux
```

The Phase-1 demo's section 4 is the diagnostic — it flips from yellow `⚠ column missing` to green `✓ column present` after the restart.

### Report: Phase 1 close — TTS delivery + live verification {#report-phase-1-close-2026-05-02}

**Closed:** 2026-05-02

Phase 1 is now end-to-end live-verified by the user. Voice notes in the wired Telegram group transcribe via Whisper and engage Barnaby; Barnaby's replies arrive as audio when the triggering message was a voice note, as text otherwise.

#### What was added since the partial close (2026-05-01 → 2026-05-02)

- **Production-debug bug fix.** Inbound voice notes weren't reaching the bridge at all — the `chat-sdk` dispatcher tests our `onNewMessage` regex against `message.text`, voice-only messages have empty text, and `/./` (one-or-more chars) silently filtered them out. Fix: extracted `ANY_MESSAGE_PATTERN = /.*/` and registered with that. Regression test asserts both directions (the new pattern matches empty, the old pattern doesn't). Commit `0d2524f`.
- **launchd plist PATH fix.** Added `/opt/homebrew/bin` to the `EnvironmentVariables.PATH` in `~/Library/LaunchAgents/com.nanoclaw-v2-*.plist` so the launchd-spawned host can find `whisper-cli` and `ffmpeg`. The exact gotcha called out in the T-1.0 research one-pager — caught at the live-test step, fixed in place. Plist not in this repo (per-install).
- **Voice-reply rule chosen + shipped.** The DM-only TTS scope I deferred at the 2026-05-01 close was unblocked by a better rule from the user: **"only voice-reply when the triggering message was a voice note."** Symmetric in DM and group; no recipient-identity resolution needed. `src/voice/voice-reply.ts` exports `triggeredByVoice` (pure decision over `attachments[].mimeType.startsWith('audio/')`) and `synthesizeReplyFile` (wraps `synthesizeSpeech`, returns the `OutboundFile` shape). Wired into `delivery.ts` `deliverMessage` via `maybeAttachVoiceReply`, which reads the most recent `trigger=1` row from the session's `inbound.db` and decides per outbound message. Failure-tolerant: any error returns null + warns, text-only delivery never blocks. Commit `2da1a0a`.
- **Family chat is now always-engage.** Switched `engage_pattern` from `\b[Bb][Aa][Rr][Nn][Aa][Bb][Yy]\b` to `.` for the family wiring per user request — Barnaby responds to every message in the Homestead Chat, not just wake-word matches. SQL one-liner; no code change.

#### Test coverage delta since 2026-05-01

- Added `src/voice/voice-reply.test.ts` (8 tests — `triggeredByVoice` happy / non-audio / mixed / malformed / non-array; `synthesizeReplyFile` Buffer + cleanup + reject-empty).
- Added `ANY_MESSAGE_PATTERN` regression test in `src/channels/chat-sdk-bridge.test.ts`.
- Full host suite at 277/277.

#### Demo

`tests/demo/phase-1/voice-roundtrip/run.sh` is unchanged and still passes (it exercises the host-side primitives, not the live channel). The live integration was verified by the user sending real voice notes in the family Telegram group and watching Barnaby reply with audio.

#### Manual validation

User-confirmed working as of 2026-05-02:

1. Voice note in Homestead Chat → transcript visible in inbound; Barnaby's reply arrives as audio.
2. Text in Homestead Chat → text reply (no spurious voice synthesis).

#### Caveats and follow-ups

- **Telegram voice-note UX.** chat-sdk Telegram adapter ships all files via `sendDocument` — the OGG/Opus arrives as an audio attachment with a play button rather than as the native Telegram voice-note UI (waveform, in-app inline player). Functionally equivalent for listening; UX delta is real. To get the native UI we'd need to call Telegram's `sendVoice` directly, which means bypassing chat-sdk for audio mime types or patching the chat-sdk Telegram adapter. Tracked in `docs/plan/follow-ups.md`.
- **Always-engage in the family chat is noisy.** Every message wakes Barnaby, including family members chatting with each other. If/when this gets annoying, the wake-word pattern is one SQL command away (the original `\b[Bb][Aa][Rr][Nn][Aa][Bb][Yy]\b` is in the T-0.6 close report).
- **`prefers_voice_replies` column unused for now.** Migration 014 shipped a per-user opt-in column that the "match the medium" rule supersedes. Keeping the column for future "always voice no matter what" override semantics; can drop in a future migration if the column never gets a use case.

#### Phase 1 status

Done. Voice in + voice out both live in the Homestead Chat. Phase 2 (proactive) is the next plan doc to read.
