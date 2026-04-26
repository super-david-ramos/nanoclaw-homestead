# Mental model: nanoclaw v2 invariants we inherit

What follows is the load-bearing surface area of nanoclaw v2 that the household-agent design has to fit inside. Drawn from the cloned repo's `docs/SPEC.md`, `architecture.md`, `db.md`, `isolation-model.md`, `skills-as-branches.md`, and root `CLAUDE.md`.

## Single host, per-session containers

Node host orchestrates; each session runs in its own Docker (or Apple Container) container with the Claude Agent SDK. Host ↔ container IO is **exclusively** the two session SQLite files (`inbound.db`, `outbound.db`) under `data/v2-sessions/<agent_group_id>/<session_id>/`. No IPC, no pipes, no file watchers between them. Heartbeat is a `touch` on `.heartbeat`, not a DB write.

Single-writer rule: every SQLite file has exactly one writer. Host writes the central DB and every `inbound.db`; container writes only its own `outbound.db`. Cross-mount WAL visibility is unreliable, so session DBs use `journal_mode = DELETE` and the host opens-writes-closes per write.

## Entity model

```
users (id "<channel>:<handle>", kind, display_name)
user_roles (user_id, role, agent_group_id)       — owner | admin (global or scoped)
agent_group_members (user_id, agent_group_id)    — unprivileged access gate
user_dms (user_id, channel_type, messaging_group_id) — cold-DM cache

agent_groups (workspace, memory, CLAUDE.md, personality, container config)
    ↕ many-to-many via messaging_group_agents (session_mode, trigger_rules, priority)
messaging_groups (one chat/channel on one platform; unknown_sender_policy)

sessions (agent_group_id + messaging_group_id + thread_id → per-session container)
```

Privilege is **user-level**, not agent-group-level. Three isolation modes (per `docs/isolation-model.md`): `agent-shared` (multiple channels, one session), `shared` (multiple channels, separate sessions but shared workspace), separate agent groups (full isolation).

## Four skill types

From `docs/skills-as-branches.md` and `CONTRIBUTING.md`:

| Type | Location | Distribution |
|---|---|---|
| Feature | `skill/*` git branches | `git fetch upstream skill/X && git merge upstream/skill/X` |
| Utility | `.claude/skills/<name>/` with code | Self-contained tools, copied in on install |
| Operational | `.claude/skills/<name>/` (instruction-only on `main`) | Always available — `/setup`, `/debug`, `/customize` |
| Container | `container/skills/<name>/` | Synced into every session container's `.claude/skills/` at startup |

Skill files use the [agentskills.io](https://agentskills.io) open standard: `SKILL.md` with YAML frontmatter (`name`, `description`) plus markdown instructions, optional supporting scripts.

## Channels and providers ship on long-lived branches

Trunk has the registry, not the implementations. Channels live on `channels` branch (Discord/Slack/Telegram/WhatsApp/iMessage/Resend/etc.); providers on `providers` branch (OpenCode and future non-Claude agent providers). `/add-<channel>` skills do `git fetch upstream skill/<channel> && git merge upstream/skill/<channel>`.

## Secrets via OneCLI Agent Vault

Never env vars in containers, never chat context. Per-agent secret modes default to `selective` (no secrets assigned). First-time gotcha: `onecli agents set-secret-mode --id <id> --mode all` (or assign specific secret IDs).

## Memory is markdown by default

`groups/<folder>/CLAUDE.md` plus arbitrary `*.md` files form per-agent-group memory. `groups/global/CLAUDE.md` is shared across groups (writable only by the main agent group). Already Obsidian-compatible.

## Self-modification (today)

One tier — `install_packages` and `add_mcp_server`. Single-admin approval, container restart. Source-level self-edits are planned but not yet shipped (per upstream `CLAUDE.md`).

## Mental-model corollary

Almost every household-agent capability has a natural nanoclaw home. The few that don't are tracked in [06-open-questions.md](06-open-questions.md).
