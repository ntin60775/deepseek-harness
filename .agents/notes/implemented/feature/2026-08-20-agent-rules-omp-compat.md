# Agent Note: oh-my-pi-compatible agent rules

Status: implemented

English | [中文](2026-08-20-agent-rules-omp-compat.zh.md)

## Problem

The user runs oh-my-pi (omp) rule files in their projects — `.omp/rules/*.{md,mdc}` rulebooks and sticky top-level `RULES.md` files — and wants the same on-disk files to drive DeepSeek Harness sessions without duplication or migration. DeepSeek Harness had no `.omp` discovery: `dsh-agent-instructions` loads `AGENTS.md`/`CLAUDE.md` chains, and nothing parsed rule frontmatter or separated always-apply content from an on-demand rulebook.

## Decision

A new single-purpose plugin package, `packages/context/agent-rules` (`@deepseek-ai/dsh-agent-rules`), reads the omp native rule surfaces with 1:1 discovery semantics and serves them through the model surface:

- Project rules come only from `<cwd>/.omp/rules/` and only when the cwd's `.omp/` directory is non-empty; no ancestor walk, matching omp's `getConfigDirs`.
- User rules come from `<ompAgentDir>/rules/`, with the directory resolved as `ompAgentDir` config, then `PI_CODING_AGENT_DIR`, then `~/.omp/agent`.
- Sticky rules: `<ompAgentDir>/RULES.md` synthesizes rule `RULES`, and `RULES.md` in the nearest non-empty `.omp/` walking from cwd to the project root synthesizes `RULES@project`; both force `alwaysApply`. The walk stops at the nearest non-empty `.omp/` even when it lacks the file.
- Merge order is project rules, user rules, sticky user, sticky project with first-wins name deduplication, so a project rule shadows a same-named user rule.
- Frontmatter parses `description`, `globs`, and `alwaysApply`; the omp TTSR fields are recognized, reported as discovery warnings, and never enforced — stream interruption needs agent-loop support and is deferred. Rules with neither `alwaysApply` nor `description` are unreachable, matching omp.
- Always-apply rules render as `Rules from:` sections in one durable user-role message, broadest scope first and most specific last; the rulebook renders as an `<available_rules>` catalog of name/glob/description lines. The `rule` tool loads a rule's full body by exact name, rediscovering the set for the calling session's cwd.
- Publication is digest-gated over durable records (catalog entries plus always-apply identity/content digests), never the rendered framing. A changed digest appends one complete replacement message; an emptied set appends an explicit empty replacement; compaction-hidden context is re-established on the next observation. The context publishes only when the calling agent resolves this plugin's exact `rule` tool registration.
- The plugin reads through the optional `ctx.fs` provider and is a no-op without one, mirroring `dsh-agent-instructions`. `maxBytes` is a required config value; non-positive disables loading. `maxSourceBytes`, `ompAgentDir`, `projectRootMarkers`, and `catalogDescriptionMaxLength` are configurable.

## Alternatives considered

- **Extend `dsh-agent-instructions` candidates.** The candidate model is same-directory file names with content deduplication; rules are a directory glob with frontmatter semantics, name-based cross-level dedup, and an always-apply/rulebook split. Folding them in would couple two different discovery models inside one lifecycle.
- **Publish always-apply rules and the catalog as separate messages.** One message keeps the whole rule context atomic: a single digest drives republication, and the model sees the always-apply rules and the catalog that points at their on-demand siblings in one stable block.
- **Serve rulebook bodies through `read` with an internal scheme.** That would extend another package's tool surface; the `rule` tool mirrors the existing `skill` tool pattern and keeps the contract package-owned.
- **Implement TTSR in this iteration.** Aborting a provider stream mid-token and retrying with an injected rule touches agent-loop and provider streaming; the frontmatter is parsed and warned about now so rules stay portable, but enforcement remains a separate feature.

## Verification

Package tests pin discovery sources, empty-directory skipping, the nearest-non-empty sticky walk, project-over-user name dedup, `.md`/`.mdc` loading, frontmatter edge cases (unclosed block, broken YAML, string globs, non-boolean `alwaysApply`), TTSR warnings, bucketing, render order, byte-budget omission/truncation with named notices, reminder-tag escaping, the explicit empty replacement, digest stability, and the plugin publication lifecycle (initial publish, no republish on unchanged set, complete replacement on change, empty-set silence). A real composition boots `SystemPrompt`, `ToolRuntime`, `AgentRegistry`, `LocalFileSystem`, and the plugin through `ctx.plugin` and asserts the durable message and the `rule` tool's body/error behavior. Typecheck, oxlint, the workspace constraints gate, export-JSDoc, note-format, translation-pairing, README model-experience, and README limitations gates pass.

The `rule` tool is registered by the agent-rules plugin itself rather than a separate `tool-*` consumer package. The generated tool catalog (`docs/tool-catalog.md`) covers `tool-*` leaves only, so the tool schema is documented in the package README instead; the tool-* split remains available if the tool gains an independent evolution axis.

## Consequences

Projects with omp rule files get identical guidance in DeepSeek Harness sessions with no migration; the same files drive both tools. The plugin adds one durable context message per rule-set change, capped by `maxBytes`, and rereads rule files each step (digest-gated, so unchanged sets cost no tokens). Deferred work — TTSR enforcement, `@` import expansion, `.omp/AGENTS.md` context files, other tools' rule formats, cross-prompt deduplication, and step-level read caching — is recorded in the package README's Known Limitations.
