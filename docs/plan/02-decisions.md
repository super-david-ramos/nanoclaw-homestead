# Decisions index — six load-bearing choices

These are stable. If one needs to change, update the deep file in place with a dated note explaining why — don't append a new decision below.

| # | Decision | Deep dive |
|---|---|---|
| 1 | user > role > shared skill resolution as a container-skill convention | [decisions/01-skill-resolution.md](decisions/01-skill-resolution.md) |
| 2 | Drop OPA for v0; bring back only for high-stakes flows (Owen, external comms, deletes) | [decisions/02-policy-opa.md](decisions/02-policy-opa.md) |
| 3 | Voice (Whisper/Kokoro) wraps every text channel as I/O preprocessor / postprocessor | [decisions/03-voice.md](decisions/03-voice.md) |
| 4 | No pool-aware substitution, no Claude Code CLI / Max OAuth runtime | [decisions/04-no-pool-no-max.md](decisions/04-no-pool-no-max.md) |
| 5 | Self-improving skills via propose-and-confirm (informed by Hermes; opposite defaults) | [decisions/05-self-improving.md](decisions/05-self-improving.md) |
| 6 | Obsidian-compatible markdown for the memory surface (PARA layout, GFM) | [decisions/06-obsidian-markdown.md](decisions/06-obsidian-markdown.md) |

## Why these specifically

Nanoclaw v2 is opinionated infrastructure (container isolation, two-DB session split, skill-as-branch distribution, OneCLI as policy plane). Forking its primitives to bring back homestead-ts's would defeat the reason for choosing it. These six decisions keep homestead's user-visible value (multi-user role gating, voice everywhere, persistent household memory, learnable skills) while letting nanoclaw own the runtime.

When in doubt: default to nanoclaw idioms. Push back on plans that re-introduce OPA, pool accounting, the Claude Code CLI runtime, or a custom skill resolution engine before checking whether nanoclaw's existing primitive solves it.
