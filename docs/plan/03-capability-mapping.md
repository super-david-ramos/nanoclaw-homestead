# Capability mapping — homestead-ts → nanoclaw v2

| Homestead-ts capability | Nanoclaw v2 mechanism | Notes |
|---|---|---|
| Multi-channel ingest (Telegram, iMessage, SMS, webhook) | `/add-telegram`, `/add-imessage`, `/add-resend` skill branches | Trunk doesn't ship channels — install per household need |
| Voice in/out on Telegram | STT preprocessor + TTS postprocessor wrapping channel media path | [decisions/03-voice.md](decisions/03-voice.md) — channel-agnostic, not Telegram-only |
| Skill resolution (user > role > shared) | `container/skills/role-resolver/` | [decisions/01-skill-resolution.md](decisions/01-skill-resolution.md) — runtime resolver inside container |
| Single orchestrator + queue | nanoclaw host process + per-session `inbound.db` | Already FIFO per session |
| OPA default-deny + Rego | Drop in v0; nanoclaw `user_roles` + OneCLI + approvals | [decisions/02-policy-opa.md](decisions/02-policy-opa.md) — Rego returns for high-stakes flows |
| Heartbeat / proactive pushes | `schedule_task` (cron / interval / one-time) + 60s host-sweep | Morning briefing, etc. become scheduled tasks targeting specific groups |
| Watchdog / process supervision | launchd plist for `nanoclaw` (already shipped) | `launchd/com.nanoclaw.plist` exists upstream |
| fs-watcher on vault changes | scheduled task with a `script` that diffs vault state | nanoclaw's task `script` hook is purpose-built for this |
| Memory: SQLite + JSONL + Obsidian vault | nanoclaw's central + session SQLite (admin plane) + group-folder markdown (household plane) | [decisions/06-obsidian-markdown.md](decisions/06-obsidian-markdown.md) — folder layout PARA-style |
| Pool-aware substitution | DROPPED v0 | [decisions/04-no-pool-no-max.md](decisions/04-no-pool-no-max.md) |
| Claude Code CLI runtime / Max OAuth | DROPPED v0 — use OneCLI + Agent SDK | [decisions/04-no-pool-no-max.md](decisions/04-no-pool-no-max.md) |
| Persona vs infra naming split | `ASSISTANT_NAME` env + group folder names | Persona = `@Barnaby` (configurable); infra = `nanoclaw-homestead`, group-folder slugs |
| Per-user briefings (David vs Partner) | Different `agent_groups` *or* a shared agent group with sender-keyed briefing skills | Likely shared agent group + role-resolver skill — one workspace, sender-aware output |
| Owen's content filter / time windows | Custom container skill + (later) OPA gate | OPA reintroduction trigger #1 |
| External comms draft-only (email/SMS) | `pending_approvals` flow + (later) OPA | OPA reintroduction trigger #2 |
| Guest access (30-day auto-expire) | Custom messaging-group setup + scheduled cleanup task | Possibly new container skill |
| Weekly review report | Scheduled task targeting main group, writes to `groups/main/archive/reviews/` | Pure schedule + script |
| Activity replay from JSONL | nanoclaw's session DB + `conversations/` folder | Native — no JSONL layer needed |
| Telegram inline 👍/👎 feedback | Chat SDK rich content (per channel capability matrix in `docs/architecture.md`) | Investigate per platform |
| Self-improving skills | `container/skills/auto-skill-save/` (propose-and-confirm) | [decisions/05-self-improving.md](decisions/05-self-improving.md) |
