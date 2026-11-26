---
node_type: reference
title: Composer model picker and effort chips (fork-local)
service: _platform
status: active
updated: 2026-11-26
tags: [fork, web-client, model-selection, ui]
links:
  documents:
    - ../../packages/client/ui-model-selection/src/client/ModelSelect.tsx
    - ../../packages/client/ui-model-selection/src/client/index.ts
    - ../../packages/client/ui-model-selection/src/client/slots.ts
    - ../../packages/client/ui-primitives/src/Modal.tsx
  part_of: [README.md]
  relates_to:
    - ../subsystems/web-client.md
    - ../subsystems/slots.md
    - fork-merge-ritual.md
---

# Composer model picker and effort chips (fork-local)

This page records the one fork-local change that replaces an upstream interface instead of adding to it: the composer's model seat no longer opens a two-level menu (`Model ›` / `Effort ›` / plugin rows) and now shows the model chip with the current model's reasoning levels beside it, while clicking the chip opens a dialog that lists every model with its description and all of its levels. The behavior itself is documented for users in [the package README](../../packages/client/ui-model-selection/README.md); this page exists so an upstream merge cannot silently restore the old surface.

## What the patch touches

- [ModelSelect.tsx](../../packages/client/ui-model-selection/src/client/ModelSelect.tsx) — the seat renders the effort chips and the model chip, and the picker is a `Modal` dialog instead of the `MenuSurface` drill-down. The dialog centres over the conversation column: the seat reads the composer card's rectangle once per opening and shifts the card with a translate.
- [index.ts](../../packages/client/ui-model-selection/src/client/index.ts) — registers three application commands (`model.picker` on Ctrl/Cmd+Alt+M, `model.effortNext` and `model.effortPrevious` on Ctrl/Cmd+Alt+E) matched on `event.code`, and publishes picker requests through a plugin-owned observable the seat binds as `usePickerRequest`.
- [slots.ts](../../packages/client/ui-model-selection/src/client/slots.ts) — `ModelLabelOwner.placement` drops the dead `'menu'` member, and the injected face carries `sessionId`, `hooks.pickerRequest`, and `clearPickerRequest`.
- [Model.tsx](../../packages/client/ui-primitives/src/Modal.tsx) — `Modal` accepts an inline `style` for the dialog card, so a caller can place it over a panel rather than the viewport.
- [binding.ts](../../packages/client/shortcuts/src/binding.ts) — `fork-patch: web-alt-shortcuts` admits Ctrl/Cmd+Alt and any three-modifier gesture to the browser allowlist, so the same chords work in a tab and in the desktop shell; plain Alt stays rejected and the adapter's AltGraph guard still drops layout-composed input. [configuration.client.spec.ts](../../packages/client/shortcuts/tests/configuration.client.spec.ts) records the fork's expectation there.
- [locale dictionaries](../../packages/client/ui-model-selection/src/client/locales.ts) — `menu.close`, `menu.current`, `menu.keyApply`, `menu.keyClose`, `menu.back`, and the `shortcut.*` labels, in every shipped language.

The plugin slots keep their contracts: `conversation.input.model.options` now renders in the dialog footer (the agent-team switch moved there), and `conversation.input.model.pane` still replaces the body and returns focus to the entry that opened it.

## Merge control

An upstream merge that rewrites these files can drop the picker without a conflict, because the patch rewrites existing components rather than adding new ones. The guard is a marker file plus a check:

- Every patched file carries `fork-patch: composer-model-picker` in its header comment.
- `pnpm run fork:patch-check` (in [scripts/check-fork-patches.ts](../../scripts/check-fork-patches.ts)) asserts each marker still exists, and `scripts/fork-merge-ritual.sh` runs it as its first audit step after the merge.
- After an upstream rewrite, restore the markers with the picker rather than deleting the check; a file that legitimately loses the fork behavior requires removing its entry from the script's table in the same commit, which is what makes the removal visible in review.
