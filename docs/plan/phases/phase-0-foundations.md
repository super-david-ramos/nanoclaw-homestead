# Phase 0 — minimal viable household

**Goal:** one channel wired up, multi-tier skill resolution working in convention, household memory rendering in Obsidian. After Phase 0 the household has a single working agent that responds in Telegram and writes notes the household can browse.

**Active conventions:** [conventions.md](../conventions.md). TDD, integration tests where available, demo per major task, completion report per major task or set.

## Tasks

Tasks are tagged: `[setup]` = install/configuration step (no TDD code), `[code]` = TDD-able change, `[skill]` = SKILL.md convention work (structural tests + demo).

### T-0.1 `[setup]` Run `/setup` against this repo

- Walks dependencies, OneCLI auth, container build, service config.
- Manual user step in Claude Code; Phase 0 doesn't proceed without it.

**Done when:** `pnpm run dev` starts the host without errors, the agent container builds, and OneCLI is wired.

**Manual validation:** documented in completion report.

### T-0.2 `[setup]` Upstream remote — done

- `upstream` points to `qwibitai/nanoclaw` with push disabled (`no-pushing`).

**Status:** done 2026-04-26. `git remote -v` confirms.

### T-0.3 `[setup]` Install Telegram channel

- Run `/add-telegram` (instructs Claude to merge `upstream/skill/telegram` and walk through bot creation).

**Done when:** an inbound Telegram message reaches `messages_in` and the agent responds.

**Manual validation:** send a `@<assistant_name> ping` from the bound chat; expect a reply.

### T-0.4 `[skill]` `container/skills/role-resolver/` — done

- Convention skill encoding user > role > shared first-match priority.

**Status:** shipped 2026-04-25. See [decisions/01-skill-resolution.md](../decisions/01-skill-resolution.md).

**Tests still owed:** structural test (frontmatter parses, required sections present) and snapshot test of the SKILL.md content. Open as T-0.4-tests below; close before declaring Phase 0 done.

### T-0.4-tests `[code]` Structural + snapshot tests for role-resolver SKILL.md

**Red:**
- Add `container/skills/role-resolver/tests/structure.test.ts` (Vitest under `vitest.skills.config.ts`).
- Assertions:
  - Frontmatter has `name: role-resolver` and a non-empty `description`.
  - Body contains a section header for "The rule", "Where to read sender + role", and "Failure modes to avoid".
  - Snapshot match against checked-in expected SKILL.md (catches accidental edits).
- Run: `pnpm test --config vitest.skills.config.ts`. Confirm fail.

**Green:**
- Pass — the SKILL.md already exists and matches the expected shape. If it doesn't, fix the SKILL.md (don't loosen the test).

**Coverage delta:** new file. Lines: 100% of the new test file. The thing under test (a markdown file) doesn't have a coverage metric; we measure structural conformance.

### T-0.5 `[skill]` `container/skills/auto-skill-save/` — done

- Propose-and-confirm skill writer with eligibility filter, `ask_user_question` approval gate, three-tier write target, hard skip for child/guest.

**Status:** shipped 2026-04-26. See [decisions/05-self-improving.md](../decisions/05-self-improving.md).

**Tests still owed:** same shape as T-0.4-tests. Open as T-0.5-tests; close before declaring Phase 0 done.

### T-0.5-tests `[code]` Structural + snapshot tests for auto-skill-save SKILL.md

**Red:**
- Add `container/skills/auto-skill-save/tests/structure.test.ts`.
- Assertions:
  - Frontmatter has `name: auto-skill-save`, non-empty `description` mentioning "5+ tool calls" or "approval".
  - Body sections include "When to consider running", "What NOT to save", "The propose-and-confirm flow", "Failure modes to avoid".
  - Snapshot match.
- Run: `pnpm test --config vitest.skills.config.ts`. Confirm fail.

**Green:**
- Pass via existing SKILL.md.

### T-0.6 `[setup + code]` Set up the family agent group

- During or after `/setup`: register David's Telegram chat as the `family` agent group's main wiring.
- Create the PARA folder layout under `groups/family/` (`projects/`, `areas/`, `resources/`, `archive/`, `conversations/`).
- Create the empty `groups/family/skills/{users,roles,shared}/` scaffolding the role-resolver expects.

**Code piece for TDD:**
- A small host-side helper `src/group-folder.ts` extension (or a new `src/family-bootstrap.ts`) that idempotently creates the PARA + skills scaffolding for a given agent group folder.

**Red test:** `src/family-bootstrap.test.ts` — given a tmp dir, calling `bootstrapFamilyFolder('family')` creates the expected directory tree. Empty `.gitkeep` files in the leaf skill directories. Idempotent — second call doesn't error.

**Green:** implement.

**Manual validation:** open `groups/family/` in Finder; expect the PARA + skills layout.

### T-0.7 `[setup]` Decide & validate Obsidian vault root

- Point Obsidian at `~/Code/nanoclaw-homestead/groups/family/` (and optionally `groups/global/`).
- Verify nanoclaw's existing `CLAUDE.md` renders cleanly. No tofu, no broken wikilinks, no Slack-mrkdwn artifacts in stored markdown.

**Manual validation:** open the vault in Obsidian; spot-check rendering of `CLAUDE.md` and any test note created via the agent.

## Demo (Phase 0 wrap)

Demo path: `tests/demo/phase-0/family-roundtrip/`

Contents:

- `README.md` — what the demo shows: Telegram message → agent response → note written to `groups/family/conversations/`, then visible in Obsidian.
- `run.sh` — sends a synthetic inbound row to `inbound.db` for the family agent group, prints the resulting `outbound.db` row plus the path of any created note. Idempotent (clears its own demo session at start).
- `expected.md` — describes the response shape and the file that should appear under `groups/family/`.

## Phase 0 done = all of:

- [ ] T-0.1 setup complete (manual)
- [x] T-0.2 upstream remote (done)
- [ ] T-0.3 Telegram installed (manual)
- [x] T-0.4 role-resolver SKILL.md (done)
- [ ] T-0.4-tests landed
- [x] T-0.5 auto-skill-save SKILL.md (done)
- [ ] T-0.5-tests landed
- [ ] T-0.6 family agent group bootstrap (code + setup)
- [ ] T-0.7 Obsidian vault verified (manual)
- [ ] Demo at `tests/demo/phase-0/family-roundtrip/` runs green
- [ ] Completion report below filled in

## Reports

<!-- Append per [conventions.md](../conventions.md) completion-report template when each major task closes. -->
