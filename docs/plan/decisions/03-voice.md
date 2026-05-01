# Decision 3 — voice (Whisper/Kokoro) wraps every text channel

Homestead-ts has dedicated voice paths on Telegram. We do better: voice on every channel, by treating it as channel I/O wrapping rather than a new channel branch.

## Architecture

- **Inbound (STT).** When a channel adapter forwards a message with an audio attachment, a preprocessor converts it to text (transcription appended to message body, original audio preserved as an attachment for the agent if it wants to listen). Implementation point is the channel adapter's media-handling step (`docs/architecture.md` §"Media Handling — Inbound") — adapters already download media and either pass native audio blocks or save to disk, which is exactly the seam we need.
- **Outbound (TTS).** When an agent's response is going to a user who has opted into voice replies (per-user setting on the user_roles row, or a per-message flag), the outbound delivery path synthesizes audio via Kokoro and attaches it to the platform-specific delivery (`send_file` for files-supporting channels, voice-note semantics for Telegram/WhatsApp).

## What we have to start from

Nanoclaw upstream ships:

- `skill/voice-transcription` — OpenAI Whisper, branched off `skill/whatsapp`. STT only.
- `skill/local-whisper` — whisper.cpp, branched off `skill/voice-transcription`. STT only.

Both are STT-only and attached to WhatsApp's media path.

## Plan

Read both branches. Decide whether to:

- Install as-is (gives WhatsApp voice in)
- Generalize to channel-agnostic (matches this decision's intent)
- Fork into `skill/voice-in` (channel-agnostic preprocessor)

Outbound TTS is greenfield — likely a new `skill/voice-out` branch that adds a Kokoro-based postprocessor at the delivery layer.

## Resource note

Whisper large-v3-turbo + Kokoro 82M was the homestead-ts assumption (lazy-loaded, idle-unload). Inside containers on a Mac Mini M2 (8 GB RAM), we may need to run both as a host-side service rather than per-container — cold-start cost would be unacceptable per turn. Decide before committing. See [open question #2 in 06-open-questions.md](../06-open-questions.md).

## Resolved 2026-05-01 — host-side, in-process, shell-out per call

**Open questions #2 + #3 resolved at the start of Phase 1.** The architecture below is what we're building.

### STT (Whisper) execution model

- **Where:** host-side, shell-out per call. The host process (Node) calls `whisper-cli` (Homebrew `whisper-cpp` formula, Metal-accelerated bottle on Apple Silicon) via `execFile`. Audio is normalized to 16 kHz mono WAV by `ffmpeg` first.
- **What runs in the container:** nothing voice-related. The container only ever sees the resulting text, with the original audio retained as an attachment reference for an agent that wants to listen.
- **Why not per-container:** Whisper `base` is ~150 MB on disk and 200–300 MB resident at inference. Multiplied across the per-session container model (one or more containers awake at any time on the 8 GB Mac Mini M2), this would compete with agent runtime memory. Bundling the binary + model in the container image bloats every image even when voice isn't used.
- **Why not a separate host service:** the call is a one-shot subprocess; a long-lived service would just be `execFile` with extra ceremony. The host process owns the call directly.
- **Default model:** `ggml-base.bin` (147 MB), kept under `data/models/`. Switchable via env var if a household needs more accuracy.
- **Resource expectation:** ~1 s wall per 30 s of audio on M1+ with `base`. Fine for one-at-a-time household use; serializes if multiple voice notes arrive simultaneously (acceptable at homestead scale).
- **Hook point in nanoclaw v2:** in each channel adapter that has audio attachments, between the platform fetch and the `inbound.db` write. The transcript is attached as a structured field on the message; the original audio path is preserved.

### TTS (Kokoro) execution model

- **Where:** same shape — host-side. Implementation TBD when T-1.2 is reached.
- **Trigger:** delivery-layer check on `users.prefers_voice_replies` (per-user opt-in flag).

### Per-user voice preference

- **Storage:** new column `users.prefers_voice_replies INTEGER NOT NULL DEFAULT 0`. Migration is a single `ALTER TABLE` statement.
- **Why not the lazier "facts in groups/global/CLAUDE.md" option:** the delivery layer needs to make the TTS-or-not decision in the hot path. Reading + LLM-interpreting markdown for every outbound message is too slow and non-deterministic. A SQL column lets delivery branch in microseconds.
- **Read site:** `delivery.ts`, immediately before the adapter `send` call.
- **Write site:** for now, a small slash command or a self-mod tool exposed to the agent. Future mobile / web settings UI is the longer path.

### Channel surface

Adapters that need media-side STT changes for Phase 1:

- **Telegram** (the only channel currently wired). Voice messages arrive as Opus-in-OGG via the Bot API.
- Others (WhatsApp, Discord, etc.) follow the same channel-agnostic preprocessor when they get installed.

### Origin

Upstream nanoclaw ships v1-only voice skills (`skill/voice-transcription`, `skill/local-whisper`) on a separate fork repo (`qwibitai/nanoclaw-whatsapp`) — they predate v2's containerized architecture and are not directly portable. We borrow the brew-formula choice and the `whisper-cli` + `ffmpeg` invocation pattern, build the integration fresh against v2's adapter + DB pipeline. See the T-1.0 research one-pager in [phases/phase-1-voice.md](../phases/phase-1-voice.md#t-10-research-output).
