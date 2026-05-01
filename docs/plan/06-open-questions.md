# Open questions

Unresolved design questions. Address each *before* the phase that depends on it. Resolution gets folded into the relevant decision doc or phase doc, then the entry here is updated to "resolved <date>: <link>".

1. **Project sender→role into `inbound.db`** vs. pass via `messages_in.kind === 'system'` payload? Cleaner schema vs. fewer migrations. Likely the former; verify against `src/session-manager.ts:writeDestinations` and `writeSessionRouting` patterns. **Blocks:** [decisions/01-skill-resolution.md](decisions/01-skill-resolution.md) production wiring.

2. ~~**Voice models — host service or per-container?**~~ **Resolved 2026-05-01:** host-side, in-process. `whisper-cpp` (brew, Metal-accelerated bottle) shells out per call from the host process before the inbound message is written to `inbound.db`. No separate service, no MCP tool indirection — the agent container only ever sees the resulting text + an attachment reference. Rationale: per-call spawn overhead on Apple Silicon is ~1s for 30s of audio with the `base` model, easily under voice-message latency tolerance; per-container model loading would compete with agent runtime memory on the 8 GB Mac Mini M2; and putting the model in the container image bloats every image by 200+ MB even when voice isn't used. Documented in [decisions/03-voice.md](decisions/03-voice.md).

3. ~~**Per-user voice preference storage**~~ **Resolved 2026-05-01:** new column `prefers_voice_replies INTEGER NOT NULL DEFAULT 0` on `users`. Picked over the `groups/global/CLAUDE.md` fact-list option because (a) the delivery layer needs to make the TTS-or-not decision *programmatically* — not via an LLM read of the markdown, which is too slow + non-deterministic for the hot path; (b) a single-column migration is two lines and tested by the existing `db-v2.test.ts` patterns; (c) future mobile / web settings UIs will need a programmatic surface anyway. Toggleable from the agent via a self-mod tool or a slash command. Documented in [decisions/03-voice.md](decisions/03-voice.md).

4. **iMessage support** — does nanoclaw's `skill/imessage` (BlueBubbles? AppleScript?) work on macOS without root? Read the branch. **Blocks:** anything beyond Telegram in Phase 0/1.

5. **Webhook channel for launchd/iOS Shortcuts** — does Chat SDK or Resend cover this, or do we need a thin custom adapter? **Blocks:** any homestead-ts L2 use case that depended on a webhook channel.

6. **Guest auto-expire** — easiest as a daily scheduled task that revokes `agent_group_members` rows past expiry. Confirm `agent_group_members` supports an `expires_at` column or we need to extend it (migration). **Blocks:** guest agent group setup.
