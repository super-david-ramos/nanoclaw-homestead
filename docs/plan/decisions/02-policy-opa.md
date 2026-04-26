# Decision 2 — drop OPA for v0; bring back only for high-stakes flows

Homestead-ts embeds OPA with `policies/*.rego`, default-deny on every tool call, hot-reloadable bundles, signed updates, and shadow mode. None of that ports in v0.

## v0 leans on nanoclaw's existing primitives

- **`user_roles` (owner / admin, global or scoped)** — gates admin commands via `src/command-gate.ts`.
- **OneCLI per-agent secret modes** — `selective` by default; the credential plane is the choke point for "what can this agent talk to?".
- **`pending_approvals` + admin-card delivery** — every credentialed action and `install_packages`/`add_mcp_server` request flows through a single-admin approval card.
- **`unknown_sender_policy` on messaging groups** — first-touch from a new sender drops by default unless the messaging group is configured to auto-register.

## Reintroduction triggers (strict order)

OPA returns when nanoclaw's primitives are too coarse. Likely shape: an MCP-tool-gate inside the agent-runner that consults a Rego bundle for:

1. **Owen's role** — content-filter outbound text, time-window enforcement, hard-deny external comms (email/SMS) regardless of what tool the agent invokes.
2. **External comms drafts** (email/SMS via Resend, Gmail) — require human approval *and* policy-side rate limiting.
3. **Destructive actions** — file deletes, `install_packages` removes, group unregister, agent destroy.
4. **Guest access** — auto-expire, scope enforcement.

Until those pressures show up, v0 ships without Rego.

## Trigger conditions for actually doing it

- (a) Owen role lands and content-filter is non-trivial; OR
- (b) external comms drafts exit local-only mode; OR
- (c) we want auditable policy diffs across deployments.

When any of these fires, draft a separate decision doc for the OPA reintroduction shape — don't bolt it on as an edit to this file.
