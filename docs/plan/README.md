# nanoclaw-homestead — plan & working norms

Index entry. Loads first; everything else loads on demand.

## What this repo is

A fork of `qwibitai/nanoclaw` v2 layered with multi-user household-agent capabilities ported from [`super-david-ramos/homestead-ts`](https://github.com/super-david-ramos/homestead-ts). The household uses chat channels (Telegram, iMessage, etc.), supports voice in/out on every channel, persists memory in markdown the household can browse via Obsidian, and runs on a Mac Mini M2 (8 GB RAM).

We build inside nanoclaw v2's mental model — not by porting homestead's runtime. The line: keep homestead's user-visible value, drop the infra nanoclaw already covers.

## Read in this order

| Step | File | When to read |
|---|---|---|
| 1 | [conventions.md](conventions.md) | Before writing any code. TDD rule, demo-script and completion-report formats. |
| 2 | [01-mental-model.md](01-mental-model.md) | The nanoclaw v2 invariants we're inheriting. |
| 3 | [02-decisions.md](02-decisions.md) | Index of the six load-bearing architectural decisions; read summaries, then drill into [decisions/](decisions/) as needed. |
| 4 | [05-phases.md](05-phases.md) | Phased build order; pick the active phase doc from [phases/](phases/) and task it out. |

Reference (load on demand):

| File | Purpose |
|---|---|
| [03-capability-mapping.md](03-capability-mapping.md) | homestead-ts capability → nanoclaw v2 mechanism table |
| [04-entity-model.md](04-entity-model.md) | proposed users, roles, agent groups (family / kids / guest / main) |
| [06-open-questions.md](06-open-questions.md) | unresolved design questions |

## Working pattern

1. Open the active phase doc under [phases/](phases/) (start with [phase-0-foundations.md](phases/phase-0-foundations.md)).
2. Pick the next pending task. If none clear, write the task list out first, in the phase doc, before coding.
3. Apply the TDD cycle from [conventions.md](conventions.md): red commit → green commit → done.
4. At each major task or set of tasks, produce: a runnable demo script + a completion report (template in conventions.md).
5. Mark the task done in the phase doc with a link to the report.

## Updating this plan

- Decisions in [02-decisions.md](02-decisions.md) and the [decisions/](decisions/) deep files are stable. If one changes, update the deep file in place with a dated note explaining why — don't append a new decision below.
- New phases get a new file under [phases/](phases/) and a row in [05-phases.md](05-phases.md).
- The README stays an index. Don't write new content into it; write content into a topic file and link from the README.
