---
node_type: index
title: Knowledge base index
service: _platform
status: active
updated: 2026-11-12
tags: [kb, docs-tree, entry]
links:
  relates_to: [AGENTS.md, ontology.md, ../AGENTS.md]
---

# Knowledge base index

Markdown plus git is the source of truth for this repository's knowledge; `.gitmark/`, `docs-map.html`, and `.scratch/` regenerate from it and stay uncommitted. Search with the `kb-search` engine (`.agents/skills/kb-search/gitmark.py`) before reading files at random, and record through the `kb-curate` skill so a new document joins an index instead of orphaning.

## Entry points and standards

- [../AGENTS.md](../AGENTS.md) — standing orders every agent session loads, with the repository layout and command list.
- [AGENTS.md](AGENTS.md) — the documentation standard: tree position, tier taxonomy, writing rules, and `verify-doc-budgets` ceilings.
- [ontology.md](ontology.md) — node types, frontmatter fields, typed links, and the lint invariants I1–I6 and I8–I10.
- [development.md](development.md) — contributor setup, daily workflow, and the CI summary.
- [glossary.md](glossary.md) — one canonical term per concept, each entry linking its implementation owner.
- [testing.md](testing.md) — testing tiers and the rules that keep a green suite meaningful.
- [../packages/README.md](../packages/README.md) — package groups and their owning pages; each package keeps its own contract in its README.
- [../.agents/notes/README.md](../.agents/notes/README.md) — decision records: what was decided, what was given up, what verification was required.

## Architecture and runtime references

- [architecture.md](architecture.md) — ordered map of composition, core packages, the agent loop, and extension points.
- [api-gateway.md](api-gateway.md) — Typert API Gateway: unary and stream `Remote` declarations and generated Host and Client contracts.
- [session-format-status.md](session-format-status.md) — Session format versions and their release status.
- [cordis-primer.md](cordis-primer.md) — condensed Cordis plugin, context, and waterfall semantics.
- [deepseek-llm-api-wire-extensions.md](deepseek-llm-api-wire-extensions.md) — harness-specific HTTP headers and additive JSON fields on the DeepSeek API.
- [rescope.md](rescope.md) — why vendored Cordis packages publish under the `@deepseek-ai` scope.

## Generated references

Each page below carries a generator marker naming its command; English sources regenerate from source, are freshness-gated, and lose hand edits. The [generated reference tier](AGENTS.md#the-tier-taxonomy-one-home-per-fact) owns the rule.

- [agent-lifecycle.md](agent-lifecycle.md) — turn and step lifecycle of one agent run.
- [capability-seams.md](capability-seams.md) — Service Definition, Service Provider, and Consumer roles for one capability.
- [event-producer-consumer.md](event-producer-consumer.md) — which component emits and consumes each typed event.
- [tool-execution-pipeline.md](tool-execution-pipeline.md) — the path a tool call travels from request to result.
- [graph-atlas.md](graph-atlas.md) — documentation graph index.
- [module-graph.md](module-graph.md) — shared-instance dependency graph.
- [tool-catalog.md](tool-catalog.md) — tool schemas the harness exposes to models.
- [config-catalog.md](config-catalog.md) — every plugin `Config` field and its default.
- [persistence-catalog.md](persistence-catalog.md) — Session persistence event catalog.
- [experimental-persistence-catalog.md](experimental-persistence-catalog.md) — record catalog owned by experimental plugins.
- [cli-help.md](cli-help.md) — `dsh` command help as printed by the CLI.

## Client UI references

- [ui-design-review-cases.md](ui-design-review-cases.md) — design judgment for alignment, spatial grouping, hierarchy, states, and geometry, with worked review cases.
- [ui-radius.md](ui-radius.md) — the unified corner-radius standard.
- [web-styling.md](web-styling.md) — styling ownership and component rules for browser client packages.

## Folder indexes

- [subsystems/README.md](subsystems/README.md) — one reference page per subsystem: types, semantics, and the generated Cordis surface.
- [cookbook/README.md](cookbook/README.md) — step-by-step how-to guides with numbered verification steps.
- [user/README.md](user/README.md) — product guides the documentation website publishes.
- [cordis-api/README.md](cordis-api/README.md) — generated Cordis API reference pages for lookup.
- [cordis-tutorial/README.md](cordis-tutorial/README.md) — the ordered path from a first plugin to a model-callable tool.
- [defensive-patterns/README.md](defensive-patterns/README.md) — rules review enforces, split by artifact.
- [postmortem/README.md](postmortem/README.md) — incident-scoped references; the only tier where war-story narrative belongs.
- [i18n/README.md](i18n/README.md) — the bilingual documentation contract and pairing workflow.
- [persistence-changes/README.md](persistence-changes/README.md) — type-change acknowledgements and historical format schemas.
- [ops/README.md](ops/README.md) — runbooks an operator performs, including the session-start procedure.
- [reference/README.md](reference/README.md) — capabilities and adaptations this fork carries on top of `upstream/master`, each traced to its owning contract.
- [plans/README.md](plans/README.md) — draft specs and tickets for units of work, written by the `grilling` and `to-tickets` skills.

## Upgrade guides

Released upgrade guides live at `upgrade-guide/v<semver>/<item>/guide.md` with their Chinese and pairing-record siblings. `verify-upgrade-guides` admits no other file in that tree, so the folder carries no index README; the version list starts at `upgrade-guide/v0.1.7-rc.2/` and the newest prerelease record is `upgrade-guide/v0.2.2-alpha.3/`. The `dsh-create-upgrade-guide` skill writes a new record.

The tree is upstream-owned: all 357 files arrive from `upstream/master` through the [merge ritual](reference/fork-merge-ritual.md), and this fork adds no commits to it. Deleting it would not stop accumulation — every upstream release merge returns a new version directory, and a guide this fork deleted but upstream later edits produces a modify/delete conflict — so the tree stays as it is. KB lint excludes `docs/upgrade-guide/`, `snapshots/`, and `apps/web/tests/expected/` through `gitmark.scope.json` at the repository root, so none of those trees contribute findings; no `README.md` belongs under `upgrade-guide/`.
