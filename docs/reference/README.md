---
node_type: index
title: Fork-local capability references
service: _platform
status: active
updated: 2026-11-10
tags: [kb, reference, fork]
links:
  part_of: [../README.md]
---

# Fork-local capability references

Each page here records one capability or adaptation this fork carries on top of `upstream/master`: what differs, where the owning contract lives, and which check proves it. Type definitions stay on [subsystems/](../subsystems/README.md) pages, package contracts on package READMEs, and decision rationale in [Agent Notes](../../.agents/notes/README.md); a page below links those owners instead of restating them.

- [fork-web-search-zai.md](fork-web-search-zai.md) — the z.ai MCP web search and reader provider under `packages/fork/`, its credential, and how a profile selects it.
- [fork-web-launcher.md](fork-web-launcher.md) — the Linux desktop window that starts and stops this checkout's `dsh web` server, and what it does not do.
- [fork-session-permanent-deletion.md](fork-session-permanent-deletion.md) — one permanent Session deletion traced from the sidebar action through the Remote command, storage removal, and registry cleanup, with its irreversibility limits and tests.
- [fork-merge-ritual.md](fork-merge-ritual.md) — the phase order of `scripts/fork-merge-ritual.sh`, what each upstream merge restores, and the script exceptions that keep fork-local surfaces alive.
- [fork-build-and-gate-adaptations.md](fork-build-and-gate-adaptations.md) — edits to the catalog generators, the Model Experience gate, and the two TypeScript program manifests that fork additions require.
- [fork-package-adaptations.md](fork-package-adaptations.md) — the single-file differences in liveshare, conversation, feedback, both inspect catalogs, and the client test runtime, each traced to the fork's Session-deletion API.
