# Working conventions

Apply to every code change in this repo. If a rule conflicts with a nanoclaw upstream convention from `CLAUDE.md` or `docs/`, the upstream convention wins — flag the conflict, don't silently override.

## TDD: red → green, no exceptions

Every behavior change ships with a failing test first.

The cycle:

1. **Red commit.** Write the test for the behavior you intend. Run it; it must fail. Commit with `test:` prefix and a message stating what behavior is being asserted.
2. **Green commit.** Write the minimum code that makes the test pass. Run the full suite (not just the new test) and confirm green. Commit with the appropriate prefix (`feat:`, `fix:`, etc.).
3. **Refactor (optional).** If the green code is ugly, refactor with the test as a safety net. Commit separately as `refactor:`.

Never commit code without a test, and never write a test that passes on first run unless you can prove the test is correctly checking the *new* behavior (e.g., by deleting the production change and watching it fail). "I'll add tests later" is not allowed in this repo.

### Where tests live

| Tree | Test runner | Path | Why |
|---|---|---|---|
| Host (`src/`) | Vitest | `src/**/*.test.ts` co-located | Standard nanoclaw layout. `pnpm test` runs these. |
| Container (`container/agent-runner/`) | bun:test | `container/agent-runner/src/**/*.test.ts` | `bun:sqlite` won't load under Vitest. Run via `cd container/agent-runner && bun test`. |
| Skills (`.claude/skills/<name>/` or `container/skills/<name>/`) | Vitest | `<skill>/tests/*.test.ts` | `vitest.skills.config.ts` already wired. |

If you're adding code outside these trees, set up the test scaffolding before writing the code.

### Markdown-only skills (SKILL.md, no code)

These are not behavior-free, but their behavior is "the agent reads the instructions and follows them." Test what we *can* assert mechanically:

- Frontmatter parses to valid YAML with required keys (`name`, `description`).
- The skill is discoverable from the directory layout the runtime expects.
- Internal links and section headers match a structural lint.
- Optionally: snapshot test of the SKILL.md content (catches accidental edits).

Behavioral tests for SKILL.md skills require a real agent call. Defer those to the integration suite (next section); a missing behavioral test is fine for markdown-only skills as long as the structural tests are present and the demo script (below) covers the happy path.

## Integration tests where available

Prefer integration over unit when both are options. The boundary that matters most is host ↔ container, mediated by `inbound.db` / `outbound.db`. Integration tests that exercise this boundary catch issues that unit tests can't:

- Cross-mount visibility (journal mode, file flush)
- Sequence-number parity (host even / container odd)
- Projection of routing/destinations into `inbound.db`
- Approval round-trips through `pending_approvals`

When adding a feature that crosses this boundary, the test plan should include at least one integration test in addition to the unit tests on each side.

If no integration test scaffolding exists for the area you're touching, add it once and reuse — don't skip it.

## Demo scripts at major task boundaries

At the end of each major task or set of related tasks, ship a runnable demo script that exercises the new functionality end-to-end.

### Where demos live

```
tests/demo/<phase>/<feature>/
├── README.md          # what this demo shows, prerequisites, expected output
├── run.sh             # the script (executable, idempotent if possible)
└── expected.md        # human-readable description of expected behavior
```

`<phase>` is the directory name of the active phase (e.g., `phase-0`). `<feature>` is a short kebab-case name for the feature being demoed (e.g., `role-resolver`).

### What a demo script should do

- Set up any preconditions (sample group folder, mock messages_in row, etc.) idempotently.
- Run the feature.
- Print human-readable output that someone unfamiliar with the code can read and understand.
- Exit non-zero on obvious failures so it's CI-runnable later.
- Clean up at the end (or document what's left behind).

A demo script is **not** a substitute for a test. Tests gate correctness; demos communicate behavior.

## Completion reports

Filed at the end of each major task or set of related tasks, before moving to the next. Lives at the bottom of the relevant phase doc under `## Reports`, or in a sibling file `docs/plan/phases/<phase>/reports/<task>.md` if longer than ~50 lines.

### Template

```markdown
# Report: <task name>

**Closed:** YYYY-MM-DD

## What was done

<2–6 bullet points of changes shipped. Reference files by path. Link to PRs or commits if applicable.>

## Test coverage

- Files: <list test files added or extended>
- Scenarios covered: <bulleted list of behaviors asserted, in plain English>
- Scenarios NOT covered: <honest list of gaps; "none" only if you've thought about it>
- Coverage delta: <if measured — line/branch percentages before/after; otherwise "not measured">

## Demo

- Path: `tests/demo/<phase>/<feature>/run.sh`
- What it shows: <one paragraph>
- How to run: <exact command>
- Expected output: <link to expected.md or paste the key lines>

## Manual validation

Steps the user should run to confirm the work is good in the real environment (these are NOT covered by automated tests):

1. <step 1>
2. <step 2>
3. <step N>

For each step, state what good looks like and what would indicate a problem.
```

### Why this format

- "What was done" gives a quick read of scope.
- "Test coverage" is honest about gaps — gaps that exist on purpose ("can't unit-test agent behavior, see integration plan") are fine; gaps you didn't notice are not.
- "Demo" gives the user a way to see it work without reading code.
- "Manual validation" closes the loop on the things automation can't catch (latency feel, rendering on a specific channel, voice quality).

If a section would be empty for a task, write "n/a — <reason>" rather than deleting the section. Future readers should be able to tell you considered it.

## When tests are hard

Some changes resist TDD: convention markdown-only skills (above), prompt-engineering tweaks, ergonomic changes to docs. The rule still holds — write whatever assertion you *can* (snapshot, link-check, lint), and document in the completion report's "Scenarios NOT covered" why a behavior test would require a live agent call. Don't use this as a backdoor to skip testing on real code paths.

## Conflicts with upstream nanoclaw conventions

This document is project-specific. Where it conflicts with nanoclaw upstream rules in `CLAUDE.md` or `docs/`:

- **Upstream wins.** Don't quietly override.
- **Surface the conflict in the completion report's "Manual validation" section** so the user can decide whether to update upstream or update this convention.
