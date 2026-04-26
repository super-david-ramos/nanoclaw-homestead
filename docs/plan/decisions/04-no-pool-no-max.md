# Decision 4 — no pool-aware substitution, no Claude Code CLI / Max OAuth

Homestead-ts's ADR-0011 (percentage-based pool snapshots, 80%/95% substitution thresholds) and ADR-0014 (pluggable Claude Code CLI / pi-agent-core runtime adapter for Max-subscription billing) do not port. v0 uses nanoclaw's default path:

- **Claude Agent SDK in-container** (the standard nanoclaw runtime).
- **OneCLI Agent Vault** for credential injection — long-lived OAuth tokens (`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`) or API key (`ANTHROPIC_API_KEY`).
- **Provider abstraction lives in nanoclaw's `src/providers/`**, not a homestead-side adapter. If we want OpenCode / Ollama / OpenRouter, install via the existing skill (`/add-opencode`, `/add-ollama-provider`).

## What we will NOT build

- A pool-snapshot ingestion layer (Anthropic dashboard scrape, OCR fallback, etc.).
- A substitution router (Opus → Sonnet → Haiku at thresholds).
- A model-routing config DSL.
- A pluggable agent-runtime adapter swapping Claude Code CLI in for Max billing.

## When to revisit

If model-routing cost becomes a real bottleneck — daily spend > $X for a sustained period, or Max sub becomes worth optimizing for. Current evidence (homestead-ts hasn't shipped past Phase -1) doesn't justify the complexity.

If we revisit, write a fresh decision doc with the reintroduction shape — don't append to this one.
