# Requirements: nanoclaw-homestead

**Defined:** 2026-05-08
**Core Value:** Daily-use household reliability — household uses agent daily across Telegram + iMessage + voice with zero unrecovered failures over a 30-day window.

## v1 Requirements

Requirements for the household-agent v1. All Phase 0 requirements have shipped (validated). Phase Bun-Migration, Phase 1, Phase 2 also shipped (tracked here for traceability). Phase Installer-Bun is in flight. Phase 3 is gated on a separate ADR (decisions/07-opa-reintroduction.md, not yet written).

### Phase 0 — Foundations (shipped)

Source: `docs/plan/phases/phase-0-foundations.md`

- [x] **REQ-phase0-setup-host**: Run `/setup`; host starts (`bun run dev`), agent container builds (`./container/build.sh`), OneCLI is wired (agent registered)
- [x] **REQ-phase0-upstream-remote**: `upstream` git remote → `qwibitai/nanoclaw` with push disabled (`no-pushing`); `git remote -v` confirms
- [x] **REQ-phase0-telegram-channel**: Telegram channel adapter installed via `/add-telegram`; inbound message reaches `messages_in`; agent responds; manual `@<assistant_name> ping` returns reply
- [x] **REQ-phase0-role-resolver-skill**: `container/skills/role-resolver/SKILL.md` shipped with structural + snapshot tests; frontmatter `name: role-resolver` and non-empty `description`; required section headers present
- [x] **REQ-phase0-auto-skill-save-skill**: `container/skills/auto-skill-save/SKILL.md` shipped with structural + snapshot tests; description mentions "5+ tool calls" or "approval"; required sections present
- [x] **REQ-phase0-family-bootstrap**: Family agent group registered in central DB (`name='Barnaby'`, `folder='family'`, engage `.`); `bootstrapFamilyFolder` creates idempotent PARA + skills tree; live Telegram→family→response wiring confirmed
- [x] **REQ-phase0-obsidian-vault**: Obsidian renders household memory cleanly (no tofu, no broken wikilinks, no Slack-mrkdwn artifacts); selective iCloud symlinks for PARA folders only; runtime files (`container.json`, `skills/{users,roles,shared}/`, `CLAUDE.local.md`) stay local
- [x] **REQ-phase0-demo**: `tests/demo/phase-0/family-roundtrip/` runs idempotently from repo root; exit 0 with recent successful route, 1 if no recent route, 2 if preconditions fail

### Phase Bun-Migration — Host runtime (shipped)

Source: `docs/plan/phases/phase-bun-migration.md`

- [x] **REQ-bun-host-migration**: Host runs Bun ≥ 1.3.13 (no Node + pnpm + vitest + tsx + better-sqlite3 in host tree); `package.json` scripts `test → bun test --isolate`, `dev → bun --watch run src/index.ts`, `start → bun run src/index.ts`; `bunfig.toml` supply-chain gate (`install.minimumReleaseAge = 259200`); host opens DBs with `{ strict: true }`; pragma access pattern `db.run("PRAGMA foo = bar")`; `T | undefined` getters append `?? undefined`; live launchd service runs `bun run src/index.ts` via Homestead Nanobot bundle wrapper; rollback recipe documented (< 2 min)

### Phase 1 — Voice Everywhere (shipped 2026-05-02)

Source: `docs/plan/phases/phase-1-voice.md`

- [x] **REQ-voice-stt**: Voice notes in any wired text channel transcribe via host-side `whisper-cli` (Homebrew `whisper-cpp`, Metal-accelerated). `src/voice/stt.ts` channel-agnostic per-call shell-out; `src/voice/transcript-attach.ts` auto-applied by chat-sdk-bridge for any audio attachment
- [x] **REQ-voice-tts**: Replies arrive as audio when triggering message was voice; text otherwise. `src/voice/tts.ts` (macOS `say` + `ffmpeg` → OGG/Opus); `src/voice/voice-reply.ts` `triggeredByVoice` decision wired into `delivery.ts` via `maybeAttachVoiceReply`
- [x] **REQ-voice-pref-column**: Migration 014 adds `users.prefers_voice_replies INTEGER NOT NULL DEFAULT 0` (column shipped; currently unused per medium-match rule)

### Phase 2 — Proactive Household Value (shipped 2026-05-02)

Source: `docs/plan/phases/phase-2-proactive.md`

- [x] **REQ-morning-briefing**: `scheduleMorningBriefing` helper in `src/modules/scheduling/morning-briefing.ts`; setup script `scripts/init-morning-briefing.ts`; cron `45 6 * * *` local; idempotent series_id-based; preserves user pause
- [x] **REQ-fs-watcher**: `scheduleFsWatcher` helper in `src/modules/scheduling/fs-watcher.ts`; cron `*/15 * * * *`; container-side `vault-hash.ts` (path-aware sha256, mtime-stable, excludes `.obsidian/` / `.DS_Store` / `.trash/`); `fsWatcherDecide` first-run silent baseline + content-diff wake + missing-vault soft-fail; iCloud Obsidian vault mounted read-only at `/workspace/extra/Homestead`

### Phase Installer-Bun — Fresh-machine bootstrap rewrite (in flight)

Source: `docs/plan/phases/phase-installer-bun.md`

- [ ] **REQ-installer-bun-fresh-machine**: `bash nanoclaw.sh` produces a working install on a fresh machine where Bun is the host runtime
  - Runtime install path: `brew install oven-sh/bun/bun` (macOS) OR `curl -fsSL https://bun.sh/install | bash` (Linux)
  - Package install: `bun install --frozen-lockfile` against committed `bun.lock`
  - Version pin: `.bun-version` file + `engines.bun`; `package.json packageManager` field dropped
  - Native module verify: dropped (bun:sqlite is built-in)
  - TS execution: `bun run setup/index.ts`; bash → TS handoff `exec bun run --silent setup/auto.ts`
  - Status field rename: `NODE_VERSION` → `BUN_VERSION`; `setup.sh` exit codes 0=success, 2=bun missing, 1=`bun install --frozen-lockfile` failed
  - Drop corepack/npm-prefix-recovery, drop `xcode-select`/build-tools check, drop `better-sqlite3` native verify, drop `setup/install-node.sh`
  - Channel installer sweep: `setup/install-{discord,gchat,github,imessage,linear,matrix,resend,slack,teams,telegram,webex,whatsapp,whatsapp-cloud}.sh` change `pnpm install <pkg>@<v>` → `bun add <pkg>@<v>`
  - Test gate at every commit: `bun run typecheck` clean + `bun test --isolate` 318+/318+ green
  - Demo: `tests/demo/installer-bun/` (scaffolded; in progress) reproducing fresh-machine install path
  - Completion report filed at end (per `docs/plan/conventions.md`)
  - **Done state at synthesis (commits 3408170, 8b5a3b0):** T-I.1 (probe.sh better-sqlite3 native check dropped, swapped for `.bin/` marker), T-I.2, T-I.3, T-I.4 closed
  - **Pending:** T-I.5+ (TS-side runners, drop `setup/install-node.sh`, drop `packageManager` field, channel installer sweep, demo, completion report)

### Phase 3 — Owen + Safety (planned, gated)

Source: `docs/plan/phases/phase-3-owen-safety.md`

**Pre-phase gate (do not start until):** A separate decision doc exists at `docs/plan/decisions/07-opa-reintroduction.md` describing Rego bundle layout, MCP-tool-gate shape, admin approval flow. AND Owen's user identity + platform confirmed. AND `kids` agent group registered.

- [ ] **REQ-owen-kids-bootstrap**: `kids` agent group registered (same shape as T-0.6 family bootstrap); strict skill set; PARA + skills scaffolding
- [ ] **REQ-owen-child-role**: `child` role wired into `user_roles` table; host gates external comms tools for any user with `role = child`
- [ ] **REQ-owen-time-windows**: Time-window enforcement (kid 7:00–19:30 weekdays, 8:00–20:00 weekends); outside-window → message dropped with polite explanation queued for admin review
- [ ] **REQ-owen-content-filter**: Content filter via OPA reintroduction (Rego bundle, MCP-tool-gate inside agent-runner)
- [ ] **REQ-owen-transcript-review**: Daily scheduled task summarizes Owen's transcripts; emits admin-card

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Voice UX

- **REQ-v2-voice-native-telegram**: Native Telegram voice-note UX via `voice-note-send` shim for `audio/*` mime types intercepting before `bridge.send` (currently chat-sdk ships all files via `sendDocument`)
- **REQ-v2-voice-pref-decision**: Drop `users.prefers_voice_replies` OR repurpose as "always voice" override layered on the medium-match rule

### Memory / observability

- **REQ-v2-fs-watcher-per-file-diff**: Per-file-hash fs-watcher state — persist `Map<relPath, sha256>` for `{added, removed, modified}` diff (currently aggregate `{prevHash, currHash, fileCount}`)
- **REQ-v2-weekly-review**: Scheduled task targeting main group, writes to `groups/main/archive/reviews/`. Deferred from Phase 2 T-2.3.
- **REQ-v2-feedback-loop**: Telegram inline 👍/👎 feedback. Defer until household scales (≥4 active users).

### Code-quality follow-ups

- **REQ-v2-coverage-delivery-host-sweep**: `delivery.ts` (~49% line / 47% func) and `host-sweep.ts` (~21% line / 22% func) coverage low. Realistic batch: 8-12 tests for delivery, 6-10 for host-sweep.
- **REQ-v2-naming-asymmetry**: `writeOutboundDirect` / `openOutboundDb` cosmetic-but-load-bearing rename to prevent next "I called the read-only one for writes" bug.
- **REQ-v2-bun-test-pre-existing**: Address pre-existing bun-test failures in `factory.test.ts` + `poll-loop` (1 fail / 2 errors) — `poll-loop.ts:273` calls `getInboundDb()` opening `DEFAULT_INBOUND_PATH` read-only at import time when test env lacks it.
- **REQ-v2-translated-readmes**: `README_zh.md`, `README_ja.md` still reference Node + pnpm.

### Channels / scaling

- **REQ-v2-imessage**: iMessage support — confirm nanoclaw's `skill/imessage` works on macOS without root. Open question #4.
- **REQ-v2-webhook-channel**: Webhook channel for launchd/iOS Shortcuts — investigate whether Chat SDK or Resend covers this, or if a thin custom adapter is needed. Open question #5.
- **REQ-v2-guest-auto-expire**: Guest auto-expire as daily scheduled task that revokes `agent_group_members` rows past expiry. Confirm `agent_group_members` schema supports `expires_at` or migration needed. Open question #6.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. Several reflect LOCKED ADRs.

| Feature | Reason |
|---------|--------|
| OPA / Rego policy engine | nanoclaw primitives sufficient for adult-only household; reintroduce only on Phase 3 / external-comms triggers (decisions/02-policy-opa.md) |
| Pool-aware substitution / Anthropic dashboard scrape / OCR fallback | Locked: no evidence cost is the bottleneck (decisions/04-no-pool-no-max.md) |
| Claude Code CLI runtime / Max OAuth | Locked: nanoclaw's `src/providers/` covers it via OneCLI + Agent SDK (decisions/04) |
| Custom skill resolution engine (host-side pre-filtering) | Convention skill is sufficient for ≤4 users / ~20 skills; reconsider only on convention drift (decisions/01) |
| Per-container Whisper / long-lived voice daemon | Memory budget on 8 GB Mac Mini M2 + simplicity (decisions/03) |
| Vault-sync daemon / separate vault filesystem | `groups/<folder>/` IS the vault; PARA folders symlinked to iCloud (decisions/06) |
| Hermes-style silent auto-save | Approval-before-write is non-negotiable (decisions/05) |
| Persona feedback loop / weekly review automation | Manual review fine for household of 2 |
| Pi-agent-core / pluggable agent-runtime adapter | nanoclaw `src/providers/` covers it |
| Real-time chat / video posts / mobile app | Out of household-agent scope entirely |

## Traceability

Mapping v1 requirements to roadmap phases.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-phase0-setup-host | Phase 1 (Foundations) | Complete |
| REQ-phase0-upstream-remote | Phase 1 (Foundations) | Complete |
| REQ-phase0-telegram-channel | Phase 1 (Foundations) | Complete |
| REQ-phase0-role-resolver-skill | Phase 1 (Foundations) | Complete |
| REQ-phase0-auto-skill-save-skill | Phase 1 (Foundations) | Complete |
| REQ-phase0-family-bootstrap | Phase 1 (Foundations) | Complete |
| REQ-phase0-obsidian-vault | Phase 1 (Foundations) | Complete |
| REQ-phase0-demo | Phase 1 (Foundations) | Complete |
| REQ-bun-host-migration | Phase 2 (Bun Migration) | Complete |
| REQ-voice-stt | Phase 3 (Voice Everywhere) | Complete |
| REQ-voice-tts | Phase 3 (Voice Everywhere) | Complete |
| REQ-voice-pref-column | Phase 3 (Voice Everywhere) | Complete |
| REQ-morning-briefing | Phase 4 (Proactive) | Complete |
| REQ-fs-watcher | Phase 4 (Proactive) | Complete |
| REQ-installer-bun-fresh-machine | Phase 5 (Installer-Bun) | In Progress |
| REQ-owen-kids-bootstrap | Phase 6 (Owen + Safety) | Pending (gated) |
| REQ-owen-child-role | Phase 6 (Owen + Safety) | Pending (gated) |
| REQ-owen-time-windows | Phase 6 (Owen + Safety) | Pending (gated) |
| REQ-owen-content-filter | Phase 6 (Owen + Safety) | Pending (gated) |
| REQ-owen-transcript-review | Phase 6 (Owen + Safety) | Pending (gated) |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 after `/gsd-new-project` from-ingest bootstrap*
