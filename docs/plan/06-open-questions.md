# Open questions

Unresolved design questions. Address each *before* the phase that depends on it. Resolution gets folded into the relevant decision doc or phase doc, then the entry here is updated to "resolved <date>: <link>".

1. **Project sender→role into `inbound.db`** vs. pass via `messages_in.kind === 'system'` payload? Cleaner schema vs. fewer migrations. Likely the former; verify against `src/session-manager.ts:writeDestinations` and `writeSessionRouting` patterns. **Blocks:** [decisions/01-skill-resolution.md](decisions/01-skill-resolution.md) production wiring.

2. **Voice models — host service or per-container?** Cold-start cost per turn vs. memory footprint. Probably host-side service exposed via MCP tool. **Blocks:** Phase 1 (voice).

3. **Per-user voice preference storage** — extend `user_roles` row, add a new table, or stuff into `groups/global/CLAUDE.md` as a fact list? Last option is laziest and might be sufficient. **Blocks:** Phase 1 outbound TTS.

4. **iMessage support** — does nanoclaw's `skill/imessage` (BlueBubbles? AppleScript?) work on macOS without root? Read the branch. **Blocks:** anything beyond Telegram in Phase 0/1.

5. **Webhook channel for launchd/iOS Shortcuts** — does Chat SDK or Resend cover this, or do we need a thin custom adapter? **Blocks:** any homestead-ts L2 use case that depended on a webhook channel.

6. **Guest auto-expire** — easiest as a daily scheduled task that revokes `agent_group_members` rows past expiry. Confirm `agent_group_members` supports an `expires_at` column or we need to extend it (migration). **Blocks:** guest agent group setup.
