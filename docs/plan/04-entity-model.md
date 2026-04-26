# Household entity model on nanoclaw

Initial proposal. Validate against the user_roles + isolation-model specs before wiring.

## Users (in `users` table)

- `telegram:<david-id>`, `imessage:<david-handle>`, etc. — David has multiple platform identities; one canonical user row per platform.
- Same for Partner.
- `telegram:<owen-id>` — Owen (when old enough; placeholder for now).
- Guest users created on first contact, auto-tagged with expiry metadata.

## Roles (in `user_roles` table)

- David, Partner: `owner` (global). Full access.
- Owen: `admin` scoped to a kid-only agent group, OR no role at all (member-only). The choice depends on whether he needs to register groups himself — almost certainly not.
- Guests: no role, just `agent_group_members` membership scoped to a guest-specific agent group.

## Agent groups (in `agent_groups` table)

- `family` — shared household memory, shared sessions across David and Partner's channels (per `docs/isolation-model.md` Level 2: "same agent, separate sessions"). One workspace, one CLAUDE.md, but per-channel sessions so Telegram and iMessage don't bleed into each other's threads.
- `kids` — Owen's isolated agent group when needed. Strict skill set, no external comms tools.
- `guest` — temporary guests get attached here; group folder is intentionally small (no household memory access).
- `main` — the privileged admin group nanoclaw ships with. Stays as-is; David's primary admin-side surface.

## Messaging groups

Per-platform-per-conversation, the standard nanoclaw model. `messaging_group_agents` wires which agent group handles which messaging group, with `session_mode` chosen per the isolation model.

## Status

Provisional; the actual wiring happens during `/setup` in the working install, not in this doc. Phase 0 lands the family agent group first; kids and guest follow when needed.
