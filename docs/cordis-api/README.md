---
node_type: index
title: Cordis API reference index
service: cordis-api
status: active
updated: 2026-11-10
tags: [cordis]
links:
  part_of: [../README.md]
---

# Cordis API reference index

This folder is the generated Cordis API reference: each page defines the `ctx` members, classes, and types of one Cordis area for lookup, with no teaching sequence. Regenerate the English sources with `pnpm run gen-cordis-catalog` from `scripts/gen-cordis-catalog.ts`; never hand-edit them. For condensed concepts read the [Cordis primer](../cordis-primer.md), and for a step-by-step path read the [Cordis tutorial](../cordis-tutorial/index.md).

- [context.md](context.md) — defines the `ctx` object: the service-resolving proxy, its scoped child contexts, and the context members every plugin reads.
- [events.md](events.md) — defines the event-dispatch methods mixed into every context, their options, and the dispatch modes.
- [fiber.md](fiber.md) — defines a fiber, the loaded plugin instance that holds lifecycle state, validated config, and registered effects, plus the framework error types.
- [registry.md](registry.md) — defines plugin loading and dependency injection through `ctx.plugin`, `ctx.inject`, and their declaration types.
- [service.md](service.md) — defines the `Service` base class a plugin uses to expose a named API on `ctx`.
- [inherited.md](inherited.md) — summarizes the `ctx` members and events the vendored framework provides beyond the pages generated for the harness.
