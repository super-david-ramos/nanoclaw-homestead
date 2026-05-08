## Conflict Detection Report

### BLOCKERS (0)

(None — no LOCKED-vs-LOCKED contradictions, no cycle-detection blockers, no UNKNOWN-confidence-low classifications.)

### WARNINGS (0)

(None — only one PRD in the ingest set (`phase-0-foundations.md`), so no competing acceptance variants are possible.)

### INFO (5)

[INFO] Auto-resolved: LOCKED ADRs cover orthogonal scopes — no contradictions
  Note: Four LOCKED ADRs (`docs/plan/decisions/01-skill-resolution.md`, `docs/plan/decisions/03-voice.md`, `docs/plan/decisions/04-no-pool-no-max.md`, `docs/plan/decisions/05-self-improving.md`) cover orthogonal scopes — skill resolution, voice I/O, runtime/billing, self-mod skills. Two unlocked ADRs (`docs/plan/decisions/02-policy-opa.md`, `docs/plan/decisions/06-obsidian-markdown.md`) align with the locked set's posture (defer OPA, embrace nanoclaw idioms). No precedence conflict triggered.

[INFO] Auto-resolved: SPEC-vs-ADR — both SPECs are scope-disjoint from LOCKED ADRs
  Note: `docs/plan/phases/phase-bun-migration.md` and `docs/plan/phases/phase-installer-bun.md` operate on host runtime, package manager, test runner, and installer plumbing. No overlap with the four LOCKED ADRs' scopes. No precedence-mediated rewrite needed.

[INFO] Auto-resolved: phase-1-voice.md supersedes part of decisions/03-voice.md within the LOCKED scope, by author intent
  Note: Phase 1 close (2026-05-02) chose the voice-reply rule "only voice-reply when the triggering message was a voice note" — superseding the original `users.prefers_voice_replies` per-user opt-in. The column shipped (migration 014) but is currently unused. The locked ADR (`docs/plan/decisions/03-voice.md`) still describes the per-user-opt-in trigger; the phase doc explicitly notes the supersession with rationale. Treated as same-author refinement within the same locked scope, not a precedence violation. Tracked in `docs/plan/follow-ups.md` (drop column vs. retain for future "always voice" override). Downstream consumers should treat the medium-match rule as the live behavior.

[INFO] Stale empty classification file
  Note: `/Users/dr/Code/nanoclaw-homestead/.planning/intel/classifications/06-open-questions-tmp.json` is 0 bytes — a leftover temp artifact from the classifier run. Ignored by synthesis. Safe to delete; not load-bearing.

[INFO] Duplicate classification for the same source
  Note: `phase-0-foundations-md-phases.json` and `phase-0-foundations-pending.json` both classify `docs/plan/phases/phase-0-foundations.md` as PRD with identical content (medium confidence). Deduplicated to a single requirement set in `requirements.md`. No conflict.
