---
node_type: reference
title: Catalog generator, model-experience gate, and tsconfig program adaptations (fork-local)
service: _platform
status: active
updated: 2026-11-10
tags: [fork, build, generators, gates]
links:
  documents:
    - ../../scripts/gen-cordis-catalog.ts
    - ../../scripts/gen-tool-catalog.ts
    - ../../scripts/verify-package-readme-model-experience.ts
    - ../../tsconfig.host.json
    - ../../apps/web/tsconfig.json
  part_of: [README.md]
  relates_to:
    - ../development.md#typescript-project-layout
    - ../../apps/web/tests/README.md#these-are-host-face-tests
    - ../tool-catalog.md
    - ../subsystems/session.md
    - ../subsystems/persistence.md
    - ../cookbook/adding-a-package.md
    - ../../scripts/AGENTS.md
    - fork-session-permanent-deletion.md
    - fork-web-search-zai.md
---

# Catalog generator, model-experience gate, and tsconfig program adaptations (fork-local)

This page records the fork-local edits that adapt two catalog generators, one package-README gate, and the two TypeScript program manifests to this fork's additions; the edits are absent from `upstream/master` and described nowhere else but the diff. The feature itself belongs to [fork-session-permanent-deletion.md](fork-session-permanent-deletion.md) and [fork-web-search-zai.md](fork-web-search-zai.md), the layout to [docs/development.md](../development.md#typescript-project-layout), and the test-registration rule to [apps/web/tests/README.md](../../apps/web/tests/README.md#these-are-host-face-tests); this page links those instead of restating them.

## Catalog generators

- [scripts/gen-cordis-catalog.ts](../../scripts/gen-cordis-catalog.ts) adds three curated entries to its `LINK_MAP`: `SessionDeleteRequest` and `SessionDeleteValue` map to `session.md`, and `SessionPersistenceDeleteOptions` maps to `persistence.md`. The fork's Session-deletion API puts these types into projected service and Remote signatures, and the Typert projection refuses to render a signature whose referenced type is missing from the page map (`references unclassified type` in [cordis-catalog.ts](../../packages/typert/generator/src/cordis-catalog.ts)), so the entries route the type links to the subsystems pages that embed the delete signatures ([session.md](../subsystems/session.md), [persistence.md](../subsystems/persistence.md)). `pnpm run verify-cordis-catalog` re-runs the generator with `--check` and fails unless every committed artifact reproduces.

- [scripts/gen-tool-catalog.ts](../../scripts/gen-tool-catalog.ts) overrides `delete = unavailableCatalogPersistence` in `CatalogSessionPersistence`, the stub that the tool-schema boot registers through `ctx.plugin(CatalogSessionPersistence)`. The fork's `SessionPersistence` service declares an abstract `delete` ([packages/session/session-persistence/src/index.ts](../../packages/session/session-persistence/src/index.ts)), so the concrete stub must implement it for the script to compile, and the override preserves the file's stated invariant that storage operations are unreachable during schema harvest: `delete` throws like `create`, `open`, `flush`, `stat`, and `list` instead of touching stored Sessions. `pnpm run verify-tool-catalog` checks the committed [docs/tool-catalog.md](../tool-catalog.md), and `pnpm run build:check` type-checks the script against built package declarations.

- [scripts/verify-package-readme-model-experience.ts](../../scripts/verify-package-readme-model-experience.ts) registers `packages/fork/web-search-zai` in `SENTENCE_MODEL_EXPERIENCE` with `kind: 'indirect'` and the reason that the fork-local provider delegates model rendering to `dsh-tool-web`. The gate enumerates every `packages/*/*/package.json` and treats an allowlist table entry as the audit evidence for a package's short-form Model Experience section, so the new fork package joins the audited classifications while every package outside both tables still carries the canonical model-context blocks; the fork provider's [README](../../packages/fork/web-search-zai/README.md) carries the matching single `Indirectly, through` sentence the `indirect` pattern requires. The gate logic itself is unchanged, [docs/cookbook/adding-a-package.md](../cookbook/adding-a-package.md) owns the Model Experience contract, and `pnpm run verify-package-readme-model-experience` runs as a `doc-sync` gate that is additionally marked quick for `pnpm run test:docs`.

## Compiler program registrations

- [tsconfig.host.json](../../tsconfig.host.json) makes two Host-face registrations: `apps/web/tests/session-delete.e2e.ts` joins the `include` list beside the other Session-management scenarios, and `{ "path": "./packages/fork/web-search-zai" }` joins `references` beside the upstream `packages/web/*` projects. Without the include entry the fork's deletion scenario is never type-checked against the Host face, and without the reference entry the fork provider package stays out of the project list that `pnpm run build:lib:host` compiles through `scripts/compile-referenced-projects.ts` and `tsc -p tsconfig.host.json`, as [docs/development.md](../development.md#typescript-project-layout) describes.

- [apps/web/tsconfig.json](../../apps/web/tsconfig.json) adds `tests/session-delete.e2e.ts` to its `exclude` list. That project's `include` covers all of `tests`, so [apps/web/tests/README.md](../../apps/web/tests/README.md#these-are-host-face-tests) requires each new Host-face scenario to be registered in both manifests in the same change — the file in the root `tsconfig.host.json` include and here in the exclude — because a Host-face scenario missing from the exclude compiles as Client code and the Client compiler gate of `pnpm run typecheck` keeps failing with Host-service access errors until it is listed.
