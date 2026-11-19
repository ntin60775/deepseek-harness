# Agent Note: The mermaid row ships its authoring skill

Status: implemented

## Problem

The `ui-mermaid` row draws settled ` ```mermaid ` fences as diagram cards, but nothing tells the model which grammars that renderer draws. A model picking `zenuml` or `block-beta`, or reaching for mermaid's HTML labels and per-diagram theme config, produces a fence that degrades to source or ignores the chat theme. Diagram authoring guidance published elsewhere targets other renderers and their own frontmatter blocks. Shipping the two halves separately — a renderer in the bundle and guidance in an operator's skill directory — leaves the pair to drift, and a deployment that enables one gets half the behavior.

## Decision

The row serves both halves: [packages/client/ui-mermaid](../../../../packages/client/ui-mermaid/README.md) keeps the renderer as its browser half and registers a skill provider from its host half. Enabling the `ui-mermaid` row enables the diagram cards and the `mermaid` authoring skill together, and disabling the row removes both.

[assets/mermaid/SKILL.md](../../../../packages/client/ui-mermaid/assets/mermaid/SKILL.md) is the fork's own text, written from the renderer's measured behavior rather than copied from an existing skill: the grammar to pick for each relationship, the honesty rules for labels and axes, the grammars this pipeline draws, and the card's readability limits. The grammar list is measured, not promised — a keyless browser probe seeded one fence per grammar through the shipped path and read whether each settled into a card. `block-beta` and `zenuml` are named as the two that degrade, and the reason for `zenuml` (a renderer plugin this bundle does not ship) is stated, so the model reports the limit instead of silently simplifying.

The provider registers at the bundled rank through `ctx.skills.registerProvider`, with a fixed description and the packaged body, so a project or user skill named `mermaid` overrides it entirely. The instruction file is read and validated once at load; a missing file, a broken frontmatter block, or a name outside the kebab-case grammar fails the plugin. The row exposes no configuration knob: one switch for one deliverable, because no deployment has a use for guidance without rendering or rendering without guidance.

## Alternatives considered

- **Ship the guidance in the repository's `.agents/skills/` tree**: the tree is gitignored in this fork, so it would not travel with the package; a deployment enabling the row in another checkout would read the renderer without the guidance.
- **A separate `packages/skill/skill-mermaid` package enabled by a second row**: cleaner package boundary, but the pair then needs two rows and can be enabled apart, which is the drift this decision removes.
- **A `Config` field to toggle the skill**: no current deployment wants the halves apart, so the field would be an unowned option with a validation and documentation cost.
- **Copy an existing authoring skill and patch the renderer section**: the imported text carries another renderer's frontmatter and its untested grammar list; rewriting keeps only the durable ideas (grammar by meaning, honesty, visible failure) and states our measured set.

## Consequences

The package becomes model-visible: its catalog line appears in the skill catalog of every session that enables the row, and the host half gains a dependency on `dsh-skill` classified as a safe host export. The instruction body loads only on `skill(name: "mermaid")`, so a session that never draws a diagram pays one description line. A `mermaid` version bump or a sanitizer change invalidates the measured grammar list, and re-measuring it — the probe described above — is part of that change. An operator's own `mermaid` skill silently replaces the packaged one, which is the intended override path.

Verification: [skill-provider.host.spec.ts](../../../../packages/client/ui-mermaid/tests/skill-provider.host.spec.ts) registers the row against the real skill registry, asserts the catalog entry, the loaded body without frontmatter, the disappearance on disposal, and the load failures for malformed packaged metadata; the renderer's own replay scenario proves the cards, and `verify-package-dependencies`, `verify-package-readme-model-experience`, and the documentation gates cover the packaging and prose.