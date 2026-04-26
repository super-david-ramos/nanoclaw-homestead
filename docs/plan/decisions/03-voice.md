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
