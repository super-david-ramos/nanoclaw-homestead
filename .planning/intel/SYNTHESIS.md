# Synthesis Summary

Single entry point for downstream consumers (e.g., `gsd-roadmapper`). Per-type intel files sit alongside this one; conflicts report at `.planning/INGEST-CONFLICTS.md`.

---

## Doc counts by type

| Type | Count | Sources |
|---|---|---|
| ADR | 6 | `docs/plan/decisions/01-skill-resolution.md`, `02-policy-opa.md`, `03-voice.md`, `04-no-pool-no-max.md`, `05-self-improving.md`, `06-obsidian-markdown.md` |
| SPEC | 2 | `docs/plan/phases/phase-bun-migration.md`, `phase-installer-bun.md` |
| PRD | 1 | `docs/plan/phases/phase-0-foundations.md` (was classified twice with identical output; deduplicated) |
| DOC | 12 | `README.md`, `conventions.md`, `01-mental-model.md`, `02-decisions.md`, `03-capability-mapping.md`, `04-entity-model.md`, `05-phases.md`, `06-open-questions.md`, `follow-ups.md`, `phase-1-voice.md`, `phase-2-proactive.md`, `phase-3-owen-safety.md` |

Total unique sources synthesized: **21**. Stale classification artifacts: 1 empty file (`06-open-questions-tmp.json`); 1 duplicate of phase-0-foundations (consolidated).

---

## Decisions locked (4)

| Decision | Source |
|---|---|
| user > role > shared skill resolution as a container-skill convention | `docs/plan/decisions/01-skill-resolution.md` |
| Voice (Whisper/Kokoro) wraps every text channel | `docs/plan/decisions/03-voice.md` |
| No pool-aware substitution, no Claude Code CLI / Max OAuth | `docs/plan/decisions/04-no-pool-no-max.md` |
| Self-improving skills via propose-and-confirm | `docs/plan/decisions/05-self-improving.md` |

Decisions accepted (unlocked, treated as in-effect): 2 — OPA deferral, Obsidian-compatible markdown.

---

## Requirements extracted (8)

From `docs/plan/phases/phase-0-foundations.md` (Phase 0 — minimal viable household). All but the demo are marked done in the source.

| ID | Description |
|---|---|
| REQ-phase0-setup-host | Run `/setup`; host starts, container builds, OneCLI wired |
| REQ-phase0-upstream-remote | `upstream` git remote → `qwibitai/nanoclaw` (no-pushing) |
| REQ-phase0-telegram-channel | Telegram channel installed, inbound→`messages_in`, agent reply |
| REQ-phase0-role-resolver-skill | `container/skills/role-resolver/SKILL.md` shipped + structural tests |
| REQ-phase0-auto-skill-save-skill | `container/skills/auto-skill-save/SKILL.md` shipped + structural tests |
| REQ-phase0-family-bootstrap | Family agent group: PARA + skills scaffolding + DB wiring + container/Telegram wiring |
| REQ-phase0-obsidian-vault | Obsidian vault verified rendering household memory; iCloud unification via selective symlinks |
| REQ-phase0-demo | `tests/demo/phase-0/family-roundtrip/` runs green |

---

## Constraints (12)

| ID | Type |
|---|---|
| CON-bun-runtime-host | protocol |
| CON-bun-sqlite-host-mode | api-contract |
| CON-bun-test-isolate | protocol |
| CON-sqlite-pragmas | schema |
| CON-test-trees-separate | protocol |
| CON-installer-bun-fresh-machine | protocol |
| CON-supply-chain-bun | nfr |
| CON-rollback-bun-migration | protocol |
| CON-btm-bundle-wrapper | protocol |
| CON-channel-providers-skill-installed | protocol |
| CON-secrets-onecli | protocol |
| CON-cjk-fonts-default-off | nfr |
| CON-two-db-session-split | schema |

(Note: list above shows 13 — `CON-cjk-fonts-default-off` and `CON-two-db-session-split` are sourced from project CLAUDE.md / `01-mental-model.md` rather than a SPEC, but represent contracts the system must honor and were lifted into constraints to keep them load-bearing for downstream planners. Adjust if downstream consumers want strictly SPEC-derived constraints only.)

---

## Context topics (10+)

Captured in `context.md`:

- Project framing (nanoclaw-homestead extension)
- Mental model (host/container split, entity model, skill types, channels/providers, secrets, memory, self-mod)
- Decisions index (six load-bearing choices)
- Capability mapping (homestead-ts → nanoclaw v2 table)
- Household entity model (provisional)
- Phase index + out-of-scope-with-triggers
- Open questions (4 outstanding, 2 resolved into decisions/03-voice.md)
- Conventions (TDD, integration tests, demo scripts, completion reports, upstream-conflict rule)
- Phase 1 outcome (voice everywhere, live)
- Phase 2 outcome (morning briefing + fs-watcher live)
- Phase 3 pre-phase gate
- Follow-ups (resume pointer + open ledger)
- Glossary

---

## Conflicts

| Bucket | Count |
|---|---|
| BLOCKERS | 0 |
| WARNINGS | 0 |
| INFO | 5 |

INFO-only — synthesis is unambiguous; downstream routing is unblocked.

Detail: `.planning/INGEST-CONFLICTS.md`.

---

## Pointers

- Decisions detail: `.planning/intel/decisions.md`
- Requirements detail: `.planning/intel/requirements.md`
- Constraints detail: `.planning/intel/constraints.md`
- Context detail: `.planning/intel/context.md`
- Conflicts detail: `.planning/INGEST-CONFLICTS.md`
- Per-doc classifications: `.planning/intel/classifications/`

## Active state at synthesis time

- Branch: `feat/host-bun-migration` (NOT pushed; ahead of `main`)
- Most recent commits: `8b5a3b0` T-I.4 (probe.sh — drop better-sqlite3 native check), `3408170` T-I.1+T-I.2+T-I.3 (rewrite bootstrap chain for Bun), `54a3f71` plan: phase-installer-bun
- Live service: launchd `com.nanoclaw-v2-0ee3f1ca`, running `bun run src/index.ts` via the Homestead Nanobot bundle
- Pending phase work: `phase-installer-bun.md` T-I.5 onward (TS-side runners, drop install-node.sh, drop packageManager field, channel installer sweep, demo, completion report)
