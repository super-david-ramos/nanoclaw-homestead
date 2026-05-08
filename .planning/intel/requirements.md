# Requirements Intel

Synthesized from PRD sources. Each requirement carries source attribution and the acceptance criteria from the source phase doc.

The single PRD in this ingest is `docs/plan/phases/phase-0-foundations.md` (Phase 0 — minimal viable household). The doc was classified twice (`phase-0-foundations-md-phases.json` and `phase-0-foundations-pending.json`) with identical content — deduplicated to one set of requirements here.

Phase docs `phase-1-voice.md`, `phase-2-proactive.md`, `phase-3-owen-safety.md`, `phase-bun-migration.md`, `phase-installer-bun.md` were classified DOC or SPEC and therefore appear in `context.md` / `constraints.md`. Their embedded "Done when" lines are surfaced there.

---

## REQ-phase0-setup-host — host running, container built, OneCLI wired

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.1)
- **scope:** `/setup` skill, host bootstrap, agent container build, OneCLI auth
- **description:** Run `/setup` against the repo; the workflow walks dependencies, OneCLI auth, container build, service config.
- **acceptance:**
  - Host starts without errors (`bun run dev`; pre-bun-migration the script was `pnpm run dev`).
  - Agent container builds (`./container/build.sh`).
  - OneCLI is wired (`onecli` available, agent registered).
- **status (per source):** Done 2026-05-01 — verified equivalent state without re-running `/setup` interactively (launchd service running, container image built, OneCLI agent registered with `secretMode: "all"`, live Telegram roundtrip).

## REQ-phase0-upstream-remote — `upstream` points at `qwibitai/nanoclaw`

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.2)
- **scope:** git remote configuration
- **description:** `upstream` git remote set to `qwibitai/nanoclaw` with push disabled (`no-pushing`).
- **acceptance:** `git remote -v` confirms.
- **status:** Done 2026-04-26.

## REQ-phase0-telegram-channel — Telegram channel installed and round-tripping

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.3)
- **scope:** Telegram channel adapter, inbound `messages_in`, agent reply
- **description:** Run `/add-telegram` to merge `upstream/skill/telegram` and walk through bot creation.
- **acceptance:**
  - Inbound Telegram message reaches `messages_in`.
  - Agent responds.
  - Manual: send `@<assistant_name> ping` from the bound chat; expect a reply.
- **status:** Done — verified by live roundtrip.

## REQ-phase0-role-resolver-skill — role-resolver convention skill shipped

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.4 + T-0.4-tests)
- **related:** `decisions/01-skill-resolution.md` (LOCKED ADR)
- **scope:** `container/skills/role-resolver/SKILL.md`, structural + snapshot tests, `vitest.skills.config.ts`
- **description:** Convention skill encoding user > role > shared first-match priority. Ship the SKILL.md with structural and snapshot tests.
- **acceptance:**
  - Frontmatter has `name: role-resolver` and a non-empty `description`.
  - Body contains section headers for "The rule", "Where to read sender + role", "Failure modes to avoid".
  - Snapshot match against checked-in expected SKILL.md.
- **status:** Skill shipped 2026-04-25; tests landed 2026-04-28.

## REQ-phase0-auto-skill-save-skill — auto-skill-save propose-and-confirm skill shipped

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.5 + T-0.5-tests)
- **related:** `decisions/05-self-improving.md` (LOCKED ADR)
- **scope:** `container/skills/auto-skill-save/SKILL.md`, structural + snapshot tests
- **description:** Propose-and-confirm skill writer with eligibility filter, `ask_user_question` approval gate, three-tier write target, hard skip for child/guest.
- **acceptance:**
  - Frontmatter has `name: auto-skill-save` and a non-empty `description` mentioning "5+ tool calls" or "approval".
  - Body sections include "When to consider running", "What NOT to save", "The propose-and-confirm flow", "Failure modes to avoid".
  - Snapshot match.
- **status:** Skill shipped 2026-04-26; tests landed 2026-04-28.

## REQ-phase0-family-bootstrap — family agent group registered, on-disk PARA + skills + container/DB wiring

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.6 + close)
- **scope:** `src/family-bootstrap.ts`, `src/family-agent-bootstrap.ts`, `scripts/init-family-agent.ts`, `groups/family/{projects,areas,resources,archive,conversations,skills/{users,roles,shared}}/`, `data/v2.db`
- **description:**
  - Idempotent helper `bootstrapFamilyFolder(targetDir)` creates PARA + skills scaffolding for the family agent group folder; symlink-aware (won't pollute symlinked iCloud target).
  - Idempotent helper `ensureFamilyAgent(opts)` registers the `family` agent group + Telegram messaging group + `messaging_group_agents` wiring. Defaults: `name='Barnaby'`, `folder='family'`, `engage_mode='mention'`.
  - `scripts/init-family-agent.ts` wraps both helpers + `initGroupFilesystem` for `CLAUDE.local.md` + `container.json` + `.claude-shared/`.
- **acceptance:**
  - Calling `bootstrapFamilyFolder('family')` on a tmp dir creates the expected directory tree.
  - Empty `.gitkeep` files in leaf skill directories.
  - Idempotent — second call doesn't error or pollute.
  - Manual: `ls -la groups/family/` shows PARA folders + `skills/` + `CLAUDE.local.md`.
  - Live wiring: messages to wired Telegram chat reach the family agent and produce responses.
- **status:** Done — bootstrap helper closed 2026-04-28; DB-side wiring + Phase-0 wrap closed 2026-05-01.
- **secondary acceptance (engage_pattern):** `\b[Bb][Aa][Rr][Nn][Aa][Bb][Yy]\b` originally; subsequently switched to `.` (always-engage) per Phase 1 close decision.

## REQ-phase0-obsidian-vault — Obsidian vault verified rendering household memory

- **source:** `docs/plan/phases/phase-0-foundations.md` (T-0.7)
- **related:** `decisions/06-obsidian-markdown.md` ADR
- **scope:** Obsidian vault, iCloud Homestead vault, selective PARA symlinks
- **description:** Point Obsidian at the household vault. Verify nanoclaw's existing `CLAUDE.md` renders cleanly. Unify with iCloud Homestead vault via selective symlinks (PARA folders only; runtime files stay local).
- **acceptance:**
  - No tofu, no broken wikilinks, no Slack-mrkdwn artifacts in stored markdown.
  - Manual: open vault in Obsidian; spot-check rendering.
  - PARA folders symlink to `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Homestead/`; runtime files (`container.json`, `skills/{users,roles,shared}/`, `CLAUDE.local.md`) stay local.
- **status:** Done 2026-05-01 — Obsidian 1.12.7 installed via Homebrew, selective-symlink unification chosen, smoke-tested.

## REQ-phase0-demo — Phase 0 wrap demo runnable

- **source:** `docs/plan/phases/phase-0-foundations.md` (Demo section)
- **scope:** `tests/demo/phase-0/family-roundtrip/`
- **description:** Demo path with `README.md`, `run.sh`, `expected.md`. Shows Telegram message → agent response → note written under `groups/family/conversations/` → visible in Obsidian.
- **acceptance:**
  - Demo runs idempotently from repo root.
  - Read-only inspection of live wiring, on-disk state, recent log activity, per-session DB contents.
  - Exit 0 when wiring is in place AND a recent route succeeded; 1 if no recent route; 2 if preconditions fail.
  - (Note: the source acceptance "synthetic inbound row to inbound.db" was deliberately replaced with read-only inspection — rationale documented in the demo README.)
- **status:** Done — `tests/demo/phase-0/family-roundtrip/` runs green.
