# Phase 3 — Owen + safety

**Goal:** the household is safe to extend to a child role. Content filter, time-window enforcement, hard-deny on external comms for the child role.

**Active conventions:** [conventions.md](../conventions.md). This phase is the trigger condition for the OPA reintroduction in [decisions/02-policy-opa.md](../decisions/02-policy-opa.md). Stop the phase before coding and write a separate decision doc for the OPA shape.

## Pre-phase gate

Do not start tasks here until:

- [ ] A separate decision doc exists at `docs/plan/decisions/07-opa-reintroduction.md` (or numbered as appropriate) describing the Rego bundle layout, MCP-tool-gate shape, and admin approval flow.
- [ ] Owen's actual user identity and platform are confirmed (not the placeholder `telegram:<owen-id>`).
- [ ] The `kids` agent group is registered in `agent_groups`.

## Tasks (skeleton)

### T-3.1 `[code]` `kids` agent group bootstrap

Same shape as T-0.6 (family bootstrap), but with the strict skill set.

### T-3.2 `[code]` Owen role enforcement at the host

Wire `child` role into `user_roles`. Host gates external comms tools (email/SMS) for any user with `role = child` regardless of which agent group they message.

TDD pairs:

- Unit tests on the role-gate function (matrix of roles × tool categories).
- Integration test: child-role user sends a message that would invoke `send_email` → request blocked, audit row written.

### T-3.3 `[code]` Time-window enforcement

Per-role allowed time windows (from homestead-ts: kid 7:00–19:30 weekdays, 8:00–20:00 weekends). Outside the window → message dropped with a polite explanation queued for admin review.

TDD pairs:

- Unit tests on the time-window predicate (timezone-aware, weekday/weekend logic).
- Integration test: clock advance to outside-window → child message stored but not processed.

### T-3.4 `[code]` Content filter

Uses the OPA reintroduction. Specifics in the decision doc that gates this phase.

### T-3.5 `[code]` Transcript review queue

Owen's transcripts auto-queue for admin review. Lives as a daily scheduled task that summarizes and emits an admin-card.

## Demo (Phase 3 wrap)

Demo path: `tests/demo/phase-3/child-safety/`

Demonstrates: child-role user attempts each restricted action; each is blocked with appropriate audit and admin notification.

## Phase 3 done = all of:

- [ ] Pre-phase gate satisfied
- [ ] T-3.1 through T-3.5 (each with TDD pairs and integration tests)
- [ ] Demo runs green
- [ ] Completion reports filed
- [ ] Manual validation: an actual child-role user attempts at least three blocked actions and the system handles each correctly
