# Agent Note: A trimmed mermaid authoring skill, measured against the shipped renderer

Status: implemented

## Problem

The model writes ` ```mermaid ` fences ad hoc: grammar choice follows habit rather than the relationship being shown, and upstream mermaid guidance (including a popular [agent skill](https://github.com/toolittlecakes/mermaid-skill)) recommends per-diagram frontmatter, HTML labels, and grammars the shipped renderer cannot draw. The renderer in [ui-mermaid](../../../../packages/client/ui-mermaid/README.md) fixes `htmlLabels: false`, cuts `foreignObject` and `<use>`, takes colors from `--dsw-*` tokens, and degrades any unsupported fence to the code block with a notice. Without authoring guidance that matches those constraints, diagrams arrive as blocks the reader cannot see.

## Decision

[.agents/skills/mermaid](../../../skills/mermaid/SKILL.md) is the fork's authoring skill for inline diagrams. It keeps the upstream skill's grammar-by-meaning table and honesty rules (one idea per diagram, truthful order and cardinality, real labels, short surrounding prose, visible failure) and replaces everything renderer-specific:

- No per-diagram `config`, `themeVariables`, or `themeCSS` frontmatter. The upstream block hardcodes `#ffffff` label plates for a light-only IDE; the fork's theme comes from `--dsw-*` tokens, so an imported block would break the dark theme, and label measurement is already owned by the renderer (`htmlLabels: false` globally).
- No ZenUML and no `block-beta`: [the upstream list](https://github.com/toolittlecakes/mermaid-skill/blob/main/SKILL.md) names grammars the bundle cannot draw. ZenUML is a separate Vue renderer plugin the bundle does not ship, and `block-beta` does not survive the sanitize pipeline.
- The supported set is measured, not copied. A keyless browser probe seeded one fence per grammar through the shipped path on 2026-11-19 and read whether the fence settled into a card: `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram-v2`, `C4Context`, `C4Container`, `timeline`, `gantt`, `mindmap`, `kanban`, `quadrantChart`, `xychart`, `pie`, `packet-beta`, `architecture-beta`, `sankey-beta`, `radar-beta`, `treemap-beta`, and `gitGraph` draw cards; `block-beta` and `zenuml` degrade. C4 was checked visually in both variants, since architecture diagrams are the main reason to reach for it.

The skill states the renderer contract the model must respect: 13px base font, column fit only down to 0.85 of the natural width, scroll beyond it, a full-screen viewer at the chat scale, and visible degradation instead of silent simplification.

## Alternatives considered

- **Import the upstream skill verbatim**: its frontmatter section breaks this renderer's theming and duplicates a global setting, and its grammar list promises ZenUML, `block-beta`, and beta charts without distinguishing what renders.
- **Write the authoring guidance from scratch**: the grammar-choice table, honesty rules, and examples carry real value, and an MIT-licensed source keeps the fork from maintaining prose that upstream already maintains; only the renderer section is fork-specific.
- **No skill, rely on the renderer's notice**: the notice tells a reader that the diagram failed but not the model that its grammar choice was unsupported, so the same fence recurs.

## Consequences

The model has a stated, measured set of grammars and a reason to keep labels short, which matches the card's fit rule and viewer. Beta chart grammars draw with mermaid's own palettes rather than the theme tokens, so the skill prefers core grammars when the diagram must match the interface; a renderer change or a mermaid version bump invalidates the measured list, and re-measuring it is the obligation of whoever changes either. Upstream MIT attribution lives beside the skill ([LICENSE](../../../skills/mermaid/LICENSE)).

Verification: the skill file is prose, so the repository documentation gates (`pnpm run test:docs`) cover its formatting and links; the grammar matrix rests on the probe described above, whose per-grammar screenshots were read before writing the list.