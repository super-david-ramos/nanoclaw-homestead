# Test fixture vault

A minimal Obsidian-shaped vault used by the Phase 2 demo
(`tests/demo/phase-2/proactive/run.sh`) and any future integration test
that needs a vault to scan without touching the user's real iCloud
Obsidian vault.

PARA layout (`areas/`, `projects/`, `resources/`, `archive/`,
`conversations/`) plus a `Welcome.md` at the root, mirroring the household's
production vault shape. Files are tiny on purpose — the goal is to exercise
the `vault-hash` walker, not to look pretty.

The demo copies this directory to a `/tmp` scratch path before each run so
the original stays clean. The fixture is checked in; the scratch copy is not.
