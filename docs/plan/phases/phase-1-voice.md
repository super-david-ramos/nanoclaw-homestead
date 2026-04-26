# Phase 1 — voice everywhere

**Goal:** any text channel can accept inbound voice (STT) and produce outbound voice replies (TTS) for users who opt in. Decision rationale: [decisions/03-voice.md](../decisions/03-voice.md).

**Active conventions:** [conventions.md](../conventions.md).

## Prerequisite open questions to resolve before starting

- [ ] **Voice models — host service or per-container?** Cold-start cost per turn vs. memory footprint on Mac Mini M2 / 8 GB. Probably host-side service exposed via MCP tool. See [open question #2 in 06-open-questions.md](../06-open-questions.md). Decide first; the rest of the phase depends on this answer.
- [ ] **Per-user voice preference storage** — extend `user_roles` row, add a new table, or stuff into `groups/global/CLAUDE.md` as a fact list. Last option likely sufficient. See [open question #3](../06-open-questions.md).

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
