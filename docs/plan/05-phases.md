# Phased build order

The work breaks into three categories:

- **Install** — run an existing skill (`/add-telegram`, `/add-voice-transcription`, etc.).
- **Fork** — new branches we maintain (e.g., `skill/voice-out`).
- **Container skill** — additions under `container/skills/`.

Phases are sequential but tasks within a phase can parallelize where dependencies allow.

| Phase | Focus | Doc |
|---|---|---|
| 0 | Minimal viable household — one channel, role-resolver, auto-skill-save, Obsidian vault | [phases/phase-0-foundations.md](phases/phase-0-foundations.md) |
| 1 | Voice everywhere — STT preprocessor + TTS postprocessor across all channels | [phases/phase-1-voice.md](phases/phase-1-voice.md) |
| 2 | Proactive household value — morning briefing, fs-watcher equivalent | [phases/phase-2-proactive.md](phases/phase-2-proactive.md) |
| 3 | Owen + safety — child role, content filter, OPA reintroduction | [phases/phase-3-owen-safety.md](phases/phase-3-owen-safety.md) |
| Bun migration | Host runtime: Node + pnpm → Bun. Unifies host and container on one runtime. | [phases/phase-bun-migration.md](phases/phase-bun-migration.md) |

## Out of scope for v0 (with reintroduction conditions)

| Capability | Punted because | Bring back when |
|---|---|---|
| OPA / Rego policy engine | nanoclaw primitives sufficient for adult-only household | Owen role lands, OR external comms exit local-only mode |
| Pool-aware substitution + Max OAuth runtime | No evidence cost is the bottleneck pre-shipping | Daily cost > $X for sustained period; or Max sub becomes worth optimizing for |
| pi-agent-core / Claude Code CLI runtime adapter | nanoclaw's provider abstraction (`src/providers/`) covers it | Specific need that nanoclaw's providers don't satisfy |
| Persona feedback loop / weekly review automation | Manual review is fine for a household of 2 | Household scales (≥4 active users), or feedback signal becomes load-bearing for skill quality |
| Ratcheting test floors | Adopt nanoclaw's CI as-is initially | If our forks introduce regressions that nanoclaw's CI doesn't catch |

## Working pattern (per phase)

Read the phase doc → task it out (write task list into the phase doc's task section if not already there) → apply the [conventions](conventions.md) (TDD, demo, completion report) → mark tasks done → file the report.
