# Expected output — family-roundtrip demo

Six sections, each starting with `=== <n>. <title> ===`. A green `✓` = passed; yellow `⚠` = warning that's allowed but flagged; red `✗` = failure that exits non-zero.

## Good output

```
=== 1. Service status ===
✓ launchd service is running

=== 2. Central DB wiring (data/v2.db) ===
✓ agent group: ag-…
name     folder  agent_provider
-------  ------  --------------
Barnaby  family
✓ wired to 1 messaging group(s)
platform_id           name            is_group  engage_mode  engage_pattern
--------------------  --------------  --------  -----------  ------------------------------
telegram:-…           Homestead Chat  1         pattern      \b[Bb][Aa][Rr][Nn][Aa][Bb][Yy]\b

=== 3. On-disk state (groups/family/) ===
  archive
  areas
  CLAUDE.local.md
  CLAUDE.md
  container.json
  conversations
  projects
  resources
  skills
✓ persona at groups/family/CLAUDE.local.md
✓ skills/users/
✓ skills/roles/
✓ skills/shared/

=== 4. Recent routing activity (logs/nanoclaw.log) ===
✓ most recent route:
  [time] INFO Message routed sessionId="sess-…" agentGroup="ag-…" engage_mode="pattern" kind="chat-sdk" userId="telegram:…" wake=true created=false agentGroupName="Barnaby"

=== 5. Session DBs (data/v2-sessions/ag-…/) ===
session: sess-…
  inbound.db: N message(s)
  (latest 3 rows shown)
  outbound.db: M message(s)
  (latest 3 rows shown — content previews start with "Hi …" / agent reply text)

=== 6. Agent-written notes (groups/family/conversations/) ===
  (file paths if any; "no notes yet" warning if conversations/ is empty — both are acceptable)

=== Summary ===
✓ Phase-0 family roundtrip is live: wiring is in place AND a real message has flowed through.
```

Exit code: `0`.

## Things that look like problems but aren't

- **`agent_provider` column is empty.** The default provider (`claude`) is implicit; `null` here is normal.
- **`groups/family/conversations/` is empty.** The agent writes notes only when the user asks it to remember something. Don't fail the demo on this.
- **Filesystem listing has both `CLAUDE.md` and `CLAUDE.local.md`.** Both are expected — the composed `CLAUDE.md` is regenerated on each spawn (see `claude-md-compose.ts`); `CLAUDE.local.md` is the persona seed.

## Things that should fail the demo

- **No `Message routed` log line for the family agent ID** → exit 1. Send a Telegram message containing "barnaby" and re-run.
- **No agent_groups row with `folder='family'`** → exit 1. Wiring was never run; see `scripts/init-family-agent.ts`.
- **Wired-count is 0** → exit 1. Run `init-family-agent.ts` to wire it.
- **Missing `skills/{users,roles,shared}/` directories** → exit 1 (the bootstrap was never run). Run `pnpm exec tsx src/family-bootstrap.ts groups/family`.

## Things that warn but pass

- **launchd service not loaded** (`⚠`) — the demo can still inspect the DB and logs, but no live delivery is happening. Acceptable if you're inspecting historical state.
- **No `logs/nanoclaw.log` file** — first-run case. Will become a hard fail (no recent route) at the summary step.
