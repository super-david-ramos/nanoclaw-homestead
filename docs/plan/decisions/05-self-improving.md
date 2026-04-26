# Decision 5 — self-improving skills via propose-and-confirm (informed by Hermes)

We looked at Nous Research's hermes-agent for an alternative substrate (their pitch is "self-improving" skills). Outcome: stay on nanoclaw, port the *capability* not the substrate.

## Findings from looking at Hermes

- **Format isn't proprietary.** Hermes uses the same agentskills.io standard (`SKILL.md` + frontmatter) that Claude Code and nanoclaw already use. Skills are interchangeable.
- **Hermes's "self-improving" is a hardcoded post-task prompt** (`run_agent.py`, "create a new skill if the approach is reusable") plus a `skill_manage` tool. No watcher, no ML loop. Skills get written to `~/.hermes/skills/` autonomously, no approval gate. Issue [#12340](https://github.com/NousResearch/hermes-agent/issues/12340) documents that the hardcoded prompt costs 2–3 minutes per task on local LLMs even when no skill gets created.
- **Anti-aligned defaults for our case:** no approval gate (wrong with a child role around), single shared `~/.hermes/skills/` directory (wrong for multi-user shadowing), per-turn latency cost (wrong on Mac Mini M2 / 8GB).

## What we built instead

`container/skills/auto-skill-save/SKILL.md`. Same idea (post-complex-turn, propose a SKILL.md), different defaults:

- **Eligibility check first.** ≥ 5 tool calls is necessary but not sufficient — must also be a named, generalizable workflow with no volatile-state dependency. Most turns will fail eligibility, no proposal surfaced.
- **Approval before write.** `ask_user_question` blocks the turn; user picks Save / Edit first / Different scope / Skip. We never write a SKILL.md silently.
- **Three-tier writes.** Default `shared/`. Bumps to role or user only on explicit choice. Plays clean with the role-resolver convention from [decisions/01-skill-resolution.md](01-skill-resolution.md).
- **Hard skip for child/guest roles.** If `sender_role` ∈ `{child, guest}`, the skill bails before the eligibility check.
- **Off by default in Phase 0.** Container skill is on disk and discoverable, but the eligibility check tightens to "explicit user request only" until we have a few real reusable workflows. Tightens by being conservative at runtime, not by toggling a config flag.

## Reintroduction trigger for the looser auto-trigger

Once we see 3+ workflows the household has actually re-invoked manually that *would* have been better as skills, we relax the eligibility check.

## Status

`container/skills/auto-skill-save/SKILL.md` shipped 2026-04-26.
