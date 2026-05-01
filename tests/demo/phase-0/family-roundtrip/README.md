# Phase-0 family-roundtrip demo

Demonstrates the Phase-0 wrap deliverable from [`docs/plan/phases/phase-0-foundations.md`](../../../../docs/plan/phases/phase-0-foundations.md): a real Telegram message reaches the family agent (`Barnaby`), the agent responds, and the household can see the conversation in the per-session DBs (and any agent-written notes in `groups/family/conversations/`).

## What this proves

- The `family` agent group exists in the central DB with the expected name and folder.
- It is wired to a Telegram messaging group (the family chat) with a wake-word pattern that does not engage on every message.
- The on-disk PARA + skills + persona scaffolding under `groups/family/` is in place.
- A real Telegram → router → container → outbound roundtrip recently succeeded (recent log line + non-empty session DBs).
- Any notes the agent has decided to write are visible in `groups/family/conversations/` (Obsidian vault root).

## Why this demo is read-only

The plan originally envisioned the demo *injecting* a synthetic inbound row. We chose not to: the family agent is wired to a real Telegram chat, so any real-flow injection would either spam the live chat or require a parallel, isolated env that duplicates the family persona and DB. Instead, the demo inspects the live state and recent log activity — the synthetic injection is left to the integration test suite (host-core.test.ts), where it lives without a real channel adapter underneath.

## Prerequisites

1. NanoClaw service running (`launchctl list | grep nanoclaw`).
2. Family agent wired (run `pnpm exec tsx scripts/init-family-agent.ts ...` once if it isn't — see the script's header for usage).
3. Bot is a member of the wired Telegram group chat.
4. **Before running the demo**, send at least one message containing "barnaby" (case-insensitive) in the Telegram chat. The demo asserts the most recent routed message; without a real one, it'll exit non-zero with a hint.

## How to run

```bash
bash tests/demo/phase-0/family-roundtrip/run.sh
```

Idempotent: read-only.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Wiring is in place AND a recent route succeeded. |
| `1` | Wiring is in place but no recent route — send a Telegram message and re-run. |
| `2` | Preconditions failed (no `sqlite3`, no `data/v2.db`). |

## Expected output

See [`expected.md`](expected.md).
