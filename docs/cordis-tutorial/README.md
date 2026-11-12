---
node_type: index
title: Cordis tutorial index
service: cordis-tutorial
status: active
updated: 2026-11-10
tags: [cordis]
links:
  part_of: [../README.md]
---

# Cordis tutorial index

This folder is an ordered tutorial: work the chapters in the sequence below, because each one builds a runnable plugin on the scratch directory the introduction sets up. The pages that define these APIs for lookup live in the [Cordis API reference](../cordis-api/context.md); the condensed concepts live in the [Cordis primer](../cordis-primer.md).

- [index.md](index.md) — orients the reader: what Cordis is, the keyless setup under `tmp/cordis-tutorial`, the chapter map, and the TypeScript notes.
- [01-first-plugin.md](01-first-plugin.md) — teaches the first plugin: the exported `apply` function, the `ctx` it receives, and the two other plugin shapes.
- [02-lifecycle-and-effects.md](02-lifecycle-and-effects.md) — teaches unloading: wrapping a resource in `ctx.effect()` and reading the fiber state machine.
- [03-services.md](03-services.md) — teaches providing a named service on `ctx` and consuming it through `inject`, including tracked and optional dependencies.
- [04-events.md](04-events.md) — teaches declaring, emitting, and listening to typed events, and choosing a dispatch mode such as the waterfall chain.
- [05-config.md](05-config.md) — teaches a validated `config` schema on a `cordis.yml` entry so bad configuration fails the load.
- [06-composition-and-hmr.md](06-composition-and-hmr.md) — teaches `cordis.yml` entry metadata, hot reload, and diagnosing a plugin that never loads.
- [07-into-the-harness.md](07-into-the-harness.md) — teaches the end state: a model-callable tool registered against the harness `tools` service and observed without an API key.
