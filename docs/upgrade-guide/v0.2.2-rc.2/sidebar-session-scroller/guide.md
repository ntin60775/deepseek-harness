---
kind: upgrade-guide
description: "The sidebar.workspaces slot loses its useSectionScroller hook and scroller type exports; the session list becomes the column's only, always-visible scroller."
---

# Sidebar session list scrolls alone with a visible scrollbar

## Change

After upgrading from 0.2.2-rc.2, the sidebar keeps its panel navigation pinned and the `sidebar.workspaces` occupant's list is the column's only vertical scroller; its scrollbar stays drawn whenever the list overflows. Previously the sidebar viewport scrolled the navigation away first, handed wheel gestures to the occupant's bound scroller, and hid every scrollbar while the pointer was outside the column. The slot no longer supplies `hookContext.useSectionScroller`, and `@deepseek-ai/dsh-client-ui-sidebar/client` no longer exports `SectionScroller`, `UseSectionScroller`, `SidebarSectionHookContext`, or `SidebarSectionInjected`. The viewport is no longer a size or scroll-state container. Custom Client plugins occupying `sidebar.workspaces` that bind the scroller or import those types are affected; the shipped ui-workspace browser is already migrated.

## Migration

1. In the occupant component, delete `useSectionScroller()` and `bindScrollerRef` calls; give the list element `overflow-y: auto` and let it scroll natively by wheel, touch, and scrollbar drag.
2. Remove imports of `SectionScroller`, `UseSectionScroller`, `SidebarSectionHookContext`, and `SidebarSectionInjected` from `@deepseek-ai/dsh-client-ui-sidebar/client`, and drop the matching slot-level `inject` and `hookContext` declarations.
3. Replace `100cqh` sizing and `@container scroll-state(...)` queries with flex fill: the section now receives the column height left by the pinned navigation (`flex: 1; min-height: 0`).
4. Load the plugin in the Web GUI, expand the sidebar with more sessions than fit, and confirm the list scrolls by wheel and by dragging its always-visible scrollbar while the navigation stays pinned.
