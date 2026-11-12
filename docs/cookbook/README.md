---
node_type: index
title: Cookbook index
service: cookbook
status: active
updated: 2026-11-10
tags: [cookbook, guide]
links:
  part_of: [../README.md]
---

# Cookbook index

Step-by-step how-to guides for changing DeepSeek Harness; each guide is an ordered procedure with numbered verification steps.

## Packages

- [Adding a workspace package](adding-a-package.md) — file-by-file checklist for creating a new `@deepseek-ai/dsh-<name>` package under `packages/`.
- [Adding a vendored package](adding-a-vendored-package.md) — file-by-file checklist for vendoring a new upstream Cordis package into `vendor/` instead of adding an npm dependency.

## Plugins and extension points

- [Extension plugin shapes](extension-cookbook.md) — reference patterns for tool, hook, UI, and protocol-driver plugins, each linking to its concrete authoring guide.
- [Tool authoring](adding-a-tool.md) — the contracts a model-facing tool must satisfy: definition, registration, execution, background jobs, and presentation.
- [Adding an LLM adapter](adding-an-llm-adapter.md) — how to connect a new model provider and the protocol obligations the shipped adapters were verified against.
- [Adding a Remote API](adding-a-remote-api.md) — the five steps to declare, register, consume on the Client, and test a `ctx.remote` endpoint.
- [Live configuration forms](adding-a-settings-card.md) — declare live fields in a plugin `Config` schema and expose them through a product-owned settings card.
- [Add a plugin feature preview](adding-a-plugin-preview.md) — how to draw the optional feature-preview illustration for an official bundle's detail document.

## Session format and persistence

- [Adding a Session log format version](adding-a-session-format-version.md) — introduce the next Session log format version without rewriting released data.
- [Reviewing persistence-type changes](reviewing-persistence-type-changes.md) — generate, acknowledge, and verify records for a changed Session persistence type before opening a pull request.

## Review and maintenance

- [Review a UI design](reviewing-ui-design.md) — review a DSH page or modal as a whole, explain findings through design principles, and verify supported changes.
- [Maintaining the dsh-code-review skill](maintaining-dsh-code-review.md) — entry point for the operator who keeps the code-review skill current through small periodic PRs.
- [Responding to review across a stacked PR chain](responding-to-pr-review-on-a-stack.md) — where a review fix lands and how it propagates through a dependent stack of PRs.
