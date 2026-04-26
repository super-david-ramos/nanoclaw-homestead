# Decision 1 — user > role > shared skill resolution as a container-skill convention

Homestead-ts ships skills under `skills/users/<user>/`, `skills/roles/<role>/`, and `skills/shared/`, with full-shadowing resolution (first match wins). We implement the same rule on nanoclaw v2 with **a single container skill that encodes the convention as agent-facing instructions**, paired with a co-located three-directory layout under each agent group's skills path.

## Mechanics that constrain the design

Verified against the cloned source, 2026-04-25:

- All container skills shipped in v2.0.13 are **SKILL.md only** (frontmatter + markdown, optionally supporting scripts). They are not host-loaded modules.
- Per `CONTRIBUTING.md:83`, container skills "are synced into each group's `.claude/skills/` directory when a container starts." The Claude Agent SDK then surfaces them based on each skill's `description:` frontmatter.
- Therefore there is no host hook for "filter skills by sender at session start" without forking nanoclaw's session-manager / container-runner. v0 stays inside the convention.

## v0 implementation

1. **Layout convention.** Each agent group keeps its skills under three subdirectories in its group folder:
   - `groups/<group>/skills/users/<user_id>/<skill-name>/SKILL.md`
   - `groups/<group>/skills/roles/<role>/<skill-name>/SKILL.md`
   - `groups/<group>/skills/shared/<skill-name>/SKILL.md`
   All three trees get mounted into the session container alongside the standard nanoclaw container skills.
2. **`container/skills/role-resolver/SKILL.md`** — a convention document loaded into every session. Its description triggers it whenever a request arrives that could be served by a duplicately-named skill across the three trees. The instructions tell the agent: read the inbound message's sender from your system prompt, look up that user's role in the system-message context the host provides, and apply first-match priority `users/<id>` → `roles/<role>` → `shared`. Activate exactly one of the matching skills.
3. **Sender-and-role visibility for the agent.** The host already passes inbound messages through `messages_in` with metadata; we make the sender's user_id and resolved role visible in the message envelope (or the per-session system prompt) so the resolver skill has something to read. Two paths to evaluate:
   - **(preferred)** Project sender→role into `inbound.db` at session wake, mirroring how `agent_destinations` and `session_routing` are projected today (`src/session-manager.ts`). The agent-runner surfaces it in the system prompt. Touches host code; small.
   - **(fallback)** Stuff sender + role into the existing message envelope (`messages_in.content` or a `system`-kind pre-message). Smaller change, slightly uglier.

## Why convention-only is fine for v0

A household of 2–4 users with ~20 skills means the agent filtering at decision-time is cheap and transparent. If the convention drifts under load (agent picks the wrong shadow), the next move is host-side pre-filtering at sync time — but that's a forked session-manager, not a skill, and we don't need it yet.

## Status

- `container/skills/role-resolver/SKILL.md` shipped 2026-04-25.
- Empty per-group `groups/<group>/skills/{users,roles,shared}/` scaffolding gets created during `/setup` for each agent group that wants the shadowing behavior.
- Real per-user skills get added as use cases land.

## Open detail

How sender→role visibility lands (the host-projection question above) — see [open question #1 in 06-open-questions.md](../06-open-questions.md).
