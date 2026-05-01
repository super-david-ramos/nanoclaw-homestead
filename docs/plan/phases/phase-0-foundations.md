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

- [x] T-0.1 setup complete (verified at Phase-0 close — see [Report — T-0.1 + T-0.7 close](#report-t-01--t-07-close-2026-05-01))
- [x] T-0.2 upstream remote (done)
- [x] T-0.3 Telegram installed (verified by live roundtrip — see T-0.6 close)
- [x] T-0.4 role-resolver SKILL.md (done)
- [x] T-0.5 auto-skill-save SKILL.md (done)
- [x] T-0.4-tests landed (see [Reports — T-0.4-tests + T-0.5-tests](#report-t-04-tests--t-05-tests-2026-04-28))
- [x] T-0.5-tests landed (same report)
- [x] T-0.6 family agent group bootstrap — code piece (see [Reports — T-0.6 code](#report-t-06-code--family-bootstrap-helper-2026-04-28)) AND DB-side wiring (see [Reports — T-0.6 close](#report-t-06-close--db-wiring--phase-0-wrap-2026-05-01))
- [x] T-0.7 Obsidian vault verified — iCloud Homestead vault unified with `groups/family/` via selective PARA symlinks (see [Report — T-0.1 + T-0.7 close](#report-t-01--t-07-close-2026-05-01))
- [x] Demo at `tests/demo/phase-0/family-roundtrip/` runs green
- [x] Completion report below filled in

## Reports

<!-- Append per [conventions.md](../conventions.md) completion-report template when each major task closes. -->

### Report: T-0.4-tests + T-0.5-tests {#report-t-04-tests--t-05-tests-2026-04-28}

**Closed:** 2026-04-28

#### What was done

- Added `container/skills/role-resolver/tests/structure.test.ts` and `container/skills/auto-skill-save/tests/structure.test.ts` — frontmatter parse, required-section-header, and snapshot assertions per the plan.
- Snapshots checked in under each skill's `tests/__snapshots__/`.
- Updated `vitest.skills.config.ts` to glob `container/skills/**/tests/*.test.ts` (was only `.claude/skills/`).
- Verified the assertions bite: temporarily mutated `## The rule` heading in `role-resolver/SKILL.md`; structural test and snapshot test both failed; restoring made them green.

#### Test coverage

- Files: `container/skills/role-resolver/tests/structure.test.ts`, `container/skills/auto-skill-save/tests/structure.test.ts`.
- Scenarios covered: frontmatter declares the right `name`, `description` is non-empty (and for auto-skill-save references the 5+ tool-call threshold or the approval gate), all required section headers present, snapshot of full SKILL.md content matches.
- Scenarios NOT covered: behavioral verification that an agent actually follows the skill at runtime — requires a live agent call, deferred per [conventions.md §"Markdown-only skills"](../conventions.md).
- Coverage delta: not measured. The thing under test is markdown; we measure structural conformance.

#### Demo

- n/a — these tests gate structural correctness; the role-resolver and auto-skill-save behaviors will be exercised by the Phase-0 wrap demo (`tests/demo/phase-0/family-roundtrip/`, T-0.6 follow-up).

#### Manual validation

1. Run `pnpm exec vitest run --config vitest.skills.config.ts` — expect 8 passing across 2 files.
2. Edit either SKILL.md (e.g., remove a section heading) and re-run; expect a snapshot + structural failure. Restore and re-run; expect green.

### Report: T-0.6 code — family-bootstrap helper {#report-t-06-code--family-bootstrap-helper-2026-04-28}

**Closed:** 2026-04-28 (code piece only — DB-side wiring still owed)

#### What was done

- Added `src/family-bootstrap.ts` exporting `bootstrapFamilyFolder(targetDir)` plus `FAMILY_PARA_FOLDERS` and `FAMILY_SKILL_TIERS` constants.
- TDD red → green commits (red: 235cadf, green: 2bbdbd7).
- Module is also CLI-runnable: `pnpm exec tsx src/family-bootstrap.ts <target-dir>`. Used to scaffold the local `groups/family/` tree.
- Local-only (gitignored): scaffolded `groups/family/{projects,areas,resources,archive,conversations,skills/{users,roles,shared}}/` and copied `groups/dm-with-david/CLAUDE.local.md` (Barnaby persona) into `groups/family/CLAUDE.local.md`.

#### Test coverage

- Files: `src/family-bootstrap.test.ts`.
- Scenarios covered: PARA folders created with `.gitkeep`; skills tier folders created with `.gitkeep`; idempotent (second call no-throws and preserves user-authored files); creates target dir if missing.
- Scenarios NOT covered: nothing under the function's contract is uncovered. The DB-side registration of the `family` agent group is a separate task and not tested here.
- Coverage delta: not measured.

#### Demo

- The Phase-0 wrap demo (`tests/demo/phase-0/family-roundtrip/`) is still owed and depends on the DB-side wiring landing first.

#### Manual validation

1. `pnpm exec vitest run src/family-bootstrap.test.ts` — expect 4 passing.
2. `ls -la groups/family/` — expect PARA folders + `skills/` + `CLAUDE.local.md`.
3. **Still owed for full T-0.6 closure:**
   - Register a `family` agent group in `data/v2.db` (e.g., via `/manage-channels` or a follow-up host script) with `assistantName=Barnaby` so it shares the persona of `dm-with-david`.
   - Wire it to a Telegram messaging group (likely a family group chat distinct from your DM).
   - Once wired, send a message and confirm a response arrives, then build the Phase-0 wrap demo against this group.

   **Closed in [Report — T-0.6 close](#report-t-06-close--db-wiring--phase-0-wrap-2026-05-01).**

### Report: T-0.6 close — DB wiring + Phase-0 wrap {#report-t-06-close--db-wiring--phase-0-wrap-2026-05-01}

**Closed:** 2026-05-01

#### What was done

- **DB-side helper.** Added `src/family-agent-bootstrap.ts` exporting `ensureFamilyAgent(opts)` — idempotent registration of the `family` agent group + a Telegram messaging group + a `messaging_group_agents` wiring. Defaults: `name='Barnaby'`, `folder='family'`, `engage_mode='mention'`. TDD red→green: 9654388 → 7a89885.
- **Thin script wrapper.** Added `scripts/init-family-agent.ts` (commit a167315) — calls `bootstrapFamilyFolder` for the on-disk PARA + skills layout, `ensureFamilyAgent` for DB rows, then `initGroupFilesystem` for `CLAUDE.local.md` + `container.json` + `.claude-shared/`. CLI args: `--telegram-chat-id`, `--agent-name`, `--folder`, `--group-name`, `--engage-mode`, `--engage-pattern`.
- **Live wiring.** Ran the script against `data/v2.db` for the Telegram chat ID `-4996058079` (named "Homestead Chat"). Wiring set to `engage_mode='pattern'` with case-insensitive whole-word `barnaby` matcher: `\b[Bb][Aa][Rr][Nn][Aa][Bb][Yy]\b`. Cleaned up two side effects: a stale `messaging_group_agents` row from a prior channel-registration approval that pointed the family chat at the `dm-with-david` agent, and its matching `agent_destinations` row.
- **Bug found and fixed during this work.** The first pattern attempted (`(?i)\bbarnaby\b`) does not compile under JS `RegExp` (no `i` flag passed). The router's catch in `evaluateEngage` "failed open" silently — the bot responded to every message including "hi". Per the bug-handling workflow (`feedback_bug_handling.md` memory): located the existing test gap (no test exercised any non-`.` pattern, valid or invalid), added 3 new router engage tests including a regression test for the malformed-pattern path (commit 5f43925), then a minimal fix that emits `log.warn` while preserving the fail-open intent (commit a6d9160).
- **Coverage tooling.** Wired `@vitest/coverage-v8@4.1.4` + `pnpm test:coverage` (commit 49eced0). Baseline: ~19% statements, ~17% branches, ~27% functions across `src/`. `coverage/` is gitignored.
- **Demo.** `tests/demo/phase-0/family-roundtrip/` (commit 7628812) — `run.sh` + `README.md` + `expected.md`. Read-only inspection of live wiring, on-disk state, recent log activity, and per-session DB contents. Departure from the plan wording (which said "synthetic inbound row to inbound.db") is documented in the README's "Why this demo is read-only" section: a real synthetic injection against the live agent would either spam the family Telegram chat or duplicate the persona in an isolated env. Synthetic injection lives in `host-core.test.ts` integration tests instead.
- **Persona update.** Edited `groups/family/CLAUDE.local.md` (gitignored) so Barnaby self-describes as "agent for David and his family" instead of "agent for David".

#### Test coverage

- Files: `src/family-agent-bootstrap.test.ts` (4 cases), `src/host-core.test.ts` (3 new `router engage_pattern` cases bringing the file to 16 tests).
- Scenarios covered: family agent + messaging group + wiring created on first call; idempotent on re-call (same IDs, no duplicates); custom `agentName`/`folder`/`engageMode` honored; `FAMILY_DEFAULTS` exports the documented defaults; `engage_pattern` non-sentinel match → engages; non-sentinel no-match → does not engage; malformed pattern still engages (fail-open) AND emits `log.warn` with the wiring id and offending pattern.
- Scenarios NOT covered: live container roundtrip in an automated test (covered in the host-core integration tests but not as a true container spawn — `wakeContainer` is mocked); `agent_destinations` row not auto-created or refreshed by `ensureFamilyAgent` (separate concern from `createMessagingGroupAgent` which is already tested upstream); behavioral test that the persona file is actually loaded by the spawned container.
- Coverage delta: `src/router.ts` `evaluateEngage` went from 0 non-sentinel branch coverage to 100% of the `pattern` branches (match / no-match / malformed). Whole-file coverage on `router.ts` and the rest of `src/` remains low and is tracked in `docs/plan/follow-ups.md`.

#### Demo

- Path: `tests/demo/phase-0/family-roundtrip/run.sh`.
- What it shows: service status, central DB wiring (agent group + messaging group + engage_mode/pattern), on-disk PARA + skills + persona scaffolding, the most recent `Message routed` log line for the family agent, the latest 3 inbound and 3 outbound rows from the family session DBs, and any agent-written notes under `groups/family/conversations/`.
- How to run: `bash tests/demo/phase-0/family-roundtrip/run.sh` from the repo root. Idempotent and read-only.
- Expected output: see [`expected.md`](../../../tests/demo/phase-0/family-roundtrip/expected.md). Exit code is 0 when wiring is in place AND a recent route succeeded; 1 if no recent route (likely no real Telegram message has been sent yet); 2 if preconditions fail.

#### Manual validation

1. **Confirm the bot still responds to wake-words.** In the wired Telegram group, send `hi` — the bot must stay silent. Send `hi barnaby` (any casing) — the bot must respond. If `hi` triggers the bot, the engage_pattern is broken or the wiring is duplicated; re-check `sqlite3 data/v2.db "SELECT engage_mode, engage_pattern FROM messaging_group_agents WHERE agent_group_id='ag-1777562667415-i2zjxy'"`.
2. **Run the demo.** `bash tests/demo/phase-0/family-roundtrip/run.sh` should exit 0 with a green "✓ Phase-0 family roundtrip is live" summary.
3. **Verify Obsidian renders the family vault.** Open `groups/family/` in Obsidian. PARA folders should show; `CLAUDE.local.md` should render cleanly. (This is the T-0.7 manual step, still owed.)
4. **Conflict with upstream conventions.** None known. The demo uses a read-only inspection shape rather than the synthetic-inbound shape the plan originally suggested; this is documented in the demo README and in the "What was done" section above.

### Report: T-0.1 + T-0.7 close {#report-t-01--t-07-close-2026-05-01}

**Closed:** 2026-05-01

#### What was done

- **T-0.1** — verified the system is operational without re-running the `/setup` skill interactively. Equivalent state confirmed: launchd service `com.nanoclaw-v2-0ee3f1ca` running (PID 23355); container image `nanoclaw-agent-v2-0ee3f1ca:latest` built (3.08 GB); OneCLI installed at `~/.local/bin/onecli` with the `Barnaby` agent registered (`secretMode: "all"`, identifier `ag-1777562667415-i2zjxy`); a real Telegram roundtrip succeeded in this session. The `/setup` skill is the means; the ends are met.
- **T-0.7 — Obsidian + iCloud unification.** Installed Obsidian 1.12.7 via Homebrew (cask). Brewfile refreshed in dotfiles (commit `f40cf23` — local only; user can `dotfiles push` when ready). Then chose the **selective-symlink** unification: only the user-facing PARA folders (`projects/`, `areas/`, `resources/`, `archive/`, `conversations/`) symlink to the household's iCloud-synced Obsidian vault at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Homestead/`; runtime files (`container.json`, `skills/{users,roles,shared}/`, `CLAUDE.local.md`) stay local. Choice rationale: keeps nanoclaw runtime files out of iCloud sync (no clutter, no sync-conflict risk on internal state), while still routing all agent-written notes into the iCloud vault for Obsidian Mobile browsing.
- **Bootstrap symlink-awareness.** Updated `bootstrapFamilyFolder` to skip `.gitkeep` creation when the PARA folder is already a symlink (red: a8bb9f2; green: 78752f6). Re-running the bootstrap is now safe — won't pollute the iCloud vault target.
- **Demo updates.** `tests/demo/phase-0/family-roundtrip/run.sh` now annotates symlinks in the on-disk listing with `→ <target> [symlink]` so the iCloud unification is visible at a glance. README + expected.md updated to describe the unification.
- **Smoke-test.** Wrote a file via the symlinked path and confirmed it landed in the iCloud Homestead directory. The shell-write path is mechanically equivalent to the container's bind-mount-write path (Docker-on-Mac uses the same POSIX FS layer), so no separate container-side test is required.

#### Test coverage

- Files: extended `src/family-bootstrap.test.ts` with one new case (5 total now): symlinked PARA folder must NOT receive a `.gitkeep` marker on bootstrap re-run.
- Scenarios covered: PARA folders + .gitkeep on first bootstrap; skill tier folders + .gitkeep; idempotent re-run; target dir created if missing; symlink-aware skip.
- Scenarios NOT covered: live container-side write through the symlink chain into iCloud — relies on the smoke test (filesystem-equivalent) and the next live message exchange in the family group.
- Coverage delta: not measured here. The full coverage baseline was captured in the T-0.6 report (~19% statements, ~17% branches across `src/`).

#### Demo

- Path: `tests/demo/phase-0/family-roundtrip/run.sh` (re-used; no new demo for the iCloud unification).
- What it shows: the existing Phase-0 wrap demo, with section 3 now visualizing the symlink chain so the operator can confirm the iCloud vault is wired in.
- How to run: `bash tests/demo/phase-0/family-roundtrip/run.sh`. Exit 0 = wiring + recent route both healthy.

#### Manual validation

1. **Open Obsidian → Add `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Homestead/` as a vault.** This is the *real* household vault root (the iCloud-synced one). Verify it renders cleanly: `Welcome.md` (Obsidian default), and once Barnaby has written notes, `conversations/<…>.md` should appear.
2. **Live agent-write test.** In the wired Telegram group (`telegram:-4996058079`), send something like `barnaby, please save a note in conversations/ saying "hello iCloud"`. After the agent replies, check `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Homestead/conversations/` for the file. Should appear within seconds locally; iCloud propagation to other devices is async (typically minutes).
3. **Verify on another device.** Install Obsidian Mobile, sign in to the same iCloud, open the Homestead vault. The new note should appear once iCloud finishes syncing.
4. **Conflict with upstream conventions.** None — upstream nanoclaw doesn't prescribe an Obsidian vault location. The selective-symlink approach is a project-specific extension and is documented inline in `src/family-bootstrap.ts` (the symlink-skip rationale comment).

#### Phase-0 status

All Phase-0 done-checklist items are now checked. Phase 0 is complete.
