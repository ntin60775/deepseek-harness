---
description: "The fork/ package group: fork-local integrations that live in this checkout but are not upstream product packages."
kind: "package-group"
---

# fork/ — fork-local integrations

## Summary

Packages under `packages/fork/` exist for this fork's operating environment, not for upstream release. They stay out of shipped profiles until a fork profile selects them, are `private`, and use the `@local` scope so they cannot be mistaken for product packages. Each entry names the capability it attaches to and the service it depends on. Upstream merges leave the group untouched; the merge ritual regenerates the catalogs that include it.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`web-search-zai`](web-search-zai/README.md) | z.ai `ctx.web` providers over MCP (`web_search_prime`, `webReader`), billed as GLM Coding Plan credits, with a free HTTP fetch fallback |

-----

<a id="related-documentation"></a>
## Related documentation

- [Web subsystem](../../docs/subsystems/web.md) — the seam these providers register into.
- [Fork merge ritual rationale](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md) — why upstream merges run `scripts/fork-merge-ritual.sh` and what it restores.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The group carries no product-package clock: entries may lag upstream API churn because only this fork's owner upgrades them. `web-search-zai` is the current web backend; earlier NeuralDeep and SearXNG experiments were removed. Keep each package's tests and README current; the fork merge ritual regenerates `docs/config-catalog.md`, which includes these packages' `Config` schemas. Workstation surfaces recorded here so root `AGENTS.md` stays under its word ceiling: Web UI refinements live in the `web`-profile bundle `/home/prog7/home/dev/dsh-plugins/ui-refinement` (balance widget; README there), and `~/.local/bin/pnpm` wraps the checkout's pnpm for `plugin_manager`. `scripts/check-workspace-constraints.ts` exempts this group from release-member policy — a fork-local edit the merge ritual preserves.

</details>