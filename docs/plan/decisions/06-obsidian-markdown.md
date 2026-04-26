# Decision 6 — Obsidian-compatible markdown for the memory surface

Group folders under `groups/<folder>/` are already markdown. We make them *cleanly* Obsidian-compatible.

## Conventions

- **PARA-ish layout per agent group.** Inside `groups/<group-folder>/`, organize as:
  - `CLAUDE.md` (entry point — nanoclaw's existing convention)
  - `projects/` — active multi-step efforts
  - `areas/` — ongoing responsibilities (kids' schedules, household bills, recurring meals)
  - `resources/` — reference notes (recipes, contractor contacts, etc.)
  - `archive/` — past projects, completed reminders
  - `conversations/` — searchable transcripts (already nanoclaw convention per `groups/main/CLAUDE.md`)
- **Plain GFM only in stored notes.** Slack mrkdwn / Telegram-flavored markdown applies only to *outbound messages* on those platforms (nanoclaw already handles this in `groups/main/CLAUDE.md`). Stored markdown stays GFM so Obsidian renders it correctly without preprocessing.
- **No vault-sync layer.** Point Obsidian directly at `~/Code/nanoclaw-homestead/groups/family/` (or whatever the household agent group folder lands at). nanoclaw's group folders are the vault.
- **`global/CLAUDE.md` is shared facts**, written only by the main agent group (per nanoclaw convention). Treat it like an Obsidian "kitchen sink" note for cross-group household facts (calendar timezone, per-user voice preference, allergies, vehicle info, etc.).

## Wikilinks

`[[...]]` are fine — Obsidian-native and ignored by stock markdown renderers, so nanoclaw's outbound formatters can pass them through harmlessly.

## What this decision does NOT include

- A vault-sync daemon
- A separate "vault" filesystem outside `groups/`
- A custom markdown extension that's only readable inside the agent

If any of those tempt you, push back — the whole point of this decision is that nanoclaw's existing memory layer *is* the vault.
