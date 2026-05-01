---
name: autopilot
description: Long-running, self-paced work mode for nanoclaw-homestead when the user explicitly authorizes autonomous execution and won't be available to confirm intermediate steps. Encodes TDD discipline, advisor checkpoints, subagent isolation, no-push commits, and "the commit log IS the narrative" — derived from the 2026-05-01 Phase-0-close + Phase-1-MVP autopilot session that landed 24 commits across two phases without breakage.
---

# Autopilot mode

Use this skill when the user gives explicit consent to long autonomous work — phrases like "autopilot", "max effort", "work until I interrupt", "I'll be out, keep going". The user has accepted that intermediate confirmation isn't possible and that the commit log will be the audit trail.

This skill is **not** a license to skip the project's working norms. It encodes how to *uphold* them under autonomous constraints.

## The contract you're accepting

- The user can't answer mid-flight. Treat ambiguity as a stop signal, not a license to guess. Document deferred decisions instead of inventing answers.
- Every commit is reviewable later. Make commit messages self-contained — include the why, the test that gates it, and explicit "owed" notes for partial work.
- Mistakes are catchable in the local commit log; pushed mistakes are not. Push nothing.

## Order of operations

1. **Call the advisor before any substantive work.** This is the single biggest leverage point. The advisor catches phantom-scope plans, premature parallelization, and unverified assumptions. One advisor call before "executing" saves multiple later.

2. **Read the active phase doc FIRST.** Before planning the work, read `docs/plan/phases/<active>.md` start-to-finish. The plan's task list and "done when" criteria define scope. Without this read, you'll plan against an imagined phase.

3. **Resolve open questions before you start coding.** The plan's open-questions list (`docs/plan/06-open-questions.md`) and any "Prerequisite open questions" in the phase doc must be answered first. Update the docs in place. If you can't answer one, mark it as a stop signal and pick a different task.

4. **Check OneCLI credentials early.** Phases that need third-party APIs without credentials in the OneCLI vault hit a hard blocker at demo time. Run `onecli secrets list` and route around any missing credentials by picking the local-models path (or stop and document the blocker).

5. **Verify on a scratch before touching live state.** If a change affects a running container, the live DB, an iCloud-synced folder, or anything else with side effects beyond the working tree, do a smoke test on a parallel scratch first. Don't migrate the live family-agent dir as your first iCloud-mount test.

6. **TDD strict — red→green→done, every behavior change.** Conventions don't relax in autopilot. Each pair is a separate commit. The red commit's message should explicitly state what's failing and why; the green commit's message should reference the red commit and the gate.

7. **Apply the bug-handling workflow when you find a bug mid-flight.** Per `feedback_bug_handling.md` memory: find existing tests, diagnose the gap, write the regression test (red), then fix (green). Surface adjacent uncovered scenarios. Don't smuggle a "while I'm in here" cleanup into the same commit.

8. **Demo per major task.** A demo is not a substitute for a test — it communicates behavior. For a phase wrap, the demo at `tests/demo/<phase>/<feature>/` should run end-to-end on the host without external preconditions the user can't satisfy when they're back. Inspection-only demos are valid when injection would have side effects on shared state.

9. **Completion report per phase.** Honest about gaps. The "Owed" section is a feature, not an admission of failure — explicit deferred work prevents the next session from re-deriving the same scope.

## Subagent parallelization rules

- **Read-only research** (Explore, doc-fetching, code-spelunking): always safe to dispatch in parallel. No worktree needed.
- **Code edits to disjoint paths** (e.g., one subagent owns `src/voice/stt.ts`, another owns `src/voice/tts.ts`): each subagent in its own `isolation: "worktree"`. Without worktrees, last-writer-wins on Edit corrupts the tree silently.
- **Code edits to shared files** (router.ts, types.ts, channel adapters): serialize. Don't try to parallelize. The merge cost outweighs any speedup at this codebase size.
- **Slow IO** (brew install, model downloads, large fetches): use `Bash` with `run_in_background: true` and continue with other work. The runtime notifies on completion.

## Background-task discipline

- A background command's exit code 0 doesn't mean its output is what you want — verify the artifact (file size, contents, expected output line) before proceeding.
- Don't poll. The runtime auto-notifies on completion; ScheduleWakeup is the polling primitive if you really need one.

## Commit-log-as-narrative

When the user returns, the first thing they read is `git log --oneline origin/main..HEAD`. Make it tell the story:

- One commit per concept. A red and green from the same TDD pair = two commits, not one.
- Conventional prefixes (`test:`, `feat:`, `fix:`, `docs:`, `chore:`, `style:`, `refactor:`).
- Subject line under 72 chars.
- Body explains *why*, not what. Reference test names, decision docs, prior commits.
- Trailers include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` per the project's commit instructions.

## Hard stops — pause autonomous work and write a status update instead of pushing through

- A test that was passing is now failing in a way you don't understand.
- A migration runs but the live DB looks unexpected.
- A subprocess hangs or returns junk in a way the docs don't explain.
- You're about to take an action that's irreversible without user input (force-push, db drop, file deletion outside `/tmp`).
- The user's "feel free to square up shared resources" was scoped to *this project* — escalating to a shared infra change (modifying `~/.ssh`, `/etc`, system PATH, etc.) is out of scope.

When you hit a hard stop, commit the work-in-progress with a `wip:` prefix, write the situation in the commit body, and stop spawning further actions. The user reads the log on return and decides.

## Local commits vs pushes

- **Always commit locally.** Atomic, well-messaged, frequent.
- **Never push** unless the user has explicitly said "push it" in *this* session for *this* repo. Past pushes don't authorize future pushes; cross-repo pushes (e.g., dotfiles) need their own explicit consent.
- Force-push: prohibited unless the user explicitly requests by name. Never force-push to `main`/`master`.

## Deferring work

When you hit something that needs design judgment beyond what the user authorized:

1. Land the testable primitive that doesn't need the design judgment.
2. Write an "Owed" section in the relevant doc (phase doc, decisions doc, `docs/plan/follow-ups.md`).
3. Note the explicit follow-up in the commit message.
4. Move on. Don't fake the design call.

Example from the 2026-05-01 session: TTS primitive `synthesizeSpeech` shipped with full test coverage; the delivery wiring (per-user prefers_voice_replies → outbound voice note) was deferred to follow-up because per-channel voice-note semantics + group-chat recipient resolution needed user-facing design decisions.

## What to skip

- **Slack-style status updates**. The commit log is the status. Don't chatty-narrate.
- **Pre-emptive refactors**. The advisor's "don't add features beyond what the task requires" applies doubly under autonomous mode.
- **Documentation written before code is verified.** Write the docs at the close of each task, not as an upfront design. Future-you reads a doc that wasn't validated and trusts it; that trust is worth more than the savings of writing it once.
- **`brew bundle dump --force` without checking the diff first.** It will pick up drift from any package you happen to have installed locally; commit deliberately, not blindly.

## Memory updates

- Save new feedback memories per `feedback_*.md` if the user clarifies a working preference mid-session.
- Save new project memories for state changes that future sessions need to know.
- Don't save activity logs or this-session summaries — those belong in commit messages and completion reports.

## Origin

This skill was distilled from the 2026-05-01 autopilot session that closed Phase 0 (T-0.7 iCloud unification) and landed Phase 1 voice MVP (STT integration + TTS primitive + per-user preference column + demo + report). 24 commits, 31 tests added, 270 total tests passing at session pause, no push, no broken state.
