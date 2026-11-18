---
description: "The fork/ package group: fork-local integrations that live in this checkout but are not upstream product packages."
kind: "package-group"
---

# fork/ — fork-local integrations

## Summary

Packages under `packages/fork/` exist for this fork's operating environment, not for upstream release. They stay out of shipped profiles until a fork profile selects them, are `private`, and use the `@local` scope so they cannot be mistaken for product packages. Each entry names the capability it attaches to and the service it depends on. Upstream merges leave the group untouched; the merge ritual regenerates the catalogs that include it.

## Table of Contents

- [Packages](#packages)
- [Upstream upgrade protocol](#upstream-upgrade-protocol)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`web-search-zai`](web-search-zai/README.md) | z.ai `ctx.web` providers over MCP (`web_search_prime`, `webReader`), billed as GLM Coding Plan credits, with a free HTTP fetch fallback |

-----

<a id="upstream-upgrade-protocol"></a>
## Upstream upgrade protocol

A merge is not an upgrade: the fork carries packages, external plugins, and machine-local profile rows that upstream never sees, and upstream releases move the surfaces they attach to. Every upstream release goes through these gates in order, and the merge is done only when the audit is green and the UI surfaces were checked in a running Web session.

1. `pnpm run fork:upgrade-audit` compares the recorded base in [`upstream-base.json`](upstream-base.json) with `upstream/master`, lists new and changed upgrade guides, the files both sides touched, and the fork's packages, external plugins, and profile patches. It fails (`--strict`) on a fork plugin slot the merged tree no longer declares and on a profile row whose package or subpath no longer resolves.
2. Read every listed upgrade guide before adapting anything. A guide entry that names a removed slot, tool, package, export, or default is an adaptation task in the same change, not a note.
3. Adapt the fork surfaces: `packages/fork/*`, the external plugins under `DSH_FORK_PLUGIN_DIRS` (default `~/home/dev/dsh-plugins`), and the `~/.dsh` profile patch rows. Rebuild each external plugin after its source changes.
4. Check the UI surfaces in a running `dsh web`: the Session header and its Session panel toggle, the composer dock, the Plugins page, the Settings pages the profile overrides, and every screen a fork plugin renders. A surface that moved upstream, such as header entries moving into the Session panel, is a planned change; a fork surface that disappeared or renders unstyled is a merge defect.
5. Run `scripts/fork-merge-ritual.sh`. It installs, runs this audit in strict mode before the build, regenerates catalogs, and verifies typecheck, constraints, doc gates, GUI units, and snapshots.
6. Record the merged upstream commit with `pnpm run fork:upgrade-audit --record-base`; the ritual does this itself on a green run, so a hand-run merge must do it explicitly. Push only after the audit and the UI check pass.

The strict audit is the mechanical gate. The UI check is the part no gate covers, so a green audit without it still leaves the upgrade incomplete.

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