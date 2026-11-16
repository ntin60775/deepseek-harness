---
node_type: index
title: Draft specs and tickets
service: _platform
status: active
updated: 2026-11-13
tags: [kb, plans, tickets]
links:
  part_of: [../README.md]
---

# Draft specs and tickets

`docs/plans/` holds the durable spec of one unit: goal, "готово" carriers, scope, constraints, and context. The `grilling` skill writes a draft here, `to-tickets` slices it, and `ship` executes one ticket per run.

- [verify-md-wrap-kb-scope.md](verify-md-wrap-kb-scope.md) — narrow the `verify-md-wrap` corpus so knowledge-base carrier files stop failing the DSH prose rule.
- [doc-budgets-ontoship-region.md](doc-budgets-ontoship-region.md) — split the root `AGENTS.md` word budget between its body and the knowledge-base region the `init` skill writes.
- [transcript-readability.md](transcript-readability.md) — separate machine work, agent speech, and the final answer in the visible transcript; keep the todo list live during work.
- [subagent-route-visibility.md](subagent-route-visibility.md) — show each subagent's recorded model selection (`provider/model` + effort) as a catalog row line and a spawn-card chip.
- [upstream-sync-rc3.md](upstream-sync-rc3.md) — merge upstream `0.2.2-rc.3` into the fork, restore the fork surfaces, and turn the UI element classifiers into a checked table.
