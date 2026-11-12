---
node_type: reference
title: z.ai web search and reader backend (fork-local)
service: _platform
status: active
updated: 2026-11-10
tags: [fork, web-search, mcp, z-ai]
links:
  part_of: [README.md]
  documents:
    - ../../packages/fork/web-search-zai/src/index.ts
    - ../../packages/fork/web-search-zai/src/provider.ts
    - ../../packages/fork/web-search-zai/src/mcp.ts
    - ../../packages/fork/web-search-zai/src/types.ts
    - ../../packages/fork/web-search-zai/cordis.patch.yml
    - ../../packages/fork/web-search-zai/package.json
  depends_on:
    - ../subsystems/web.md
    - ../../packages/web/web/README.md
    - ../../packages/web/web-fetch-http/README.md
    - ../../packages/web/tool-web/README.md
  relates_to:
    - ../../packages/fork/README.md
    - ../../packages/fork/web-search-zai/README.md
    - ../config-catalog.md
    - ../tool-catalog.md
    - ../../packages/bundle/base/cordis.patch.yml
    - ../../AGENTS.md
  implemented_by:
    - ../../packages/fork/web-search-zai/tests/zai.spec.ts
    - ../../packages/fork/web-search-zai/tests/mcp.spec.ts
    - ../../scripts/product-package-policy.ts
    - ../../scripts/verify-package-readme-model-experience.ts
---

# z.ai web search and reader backend (fork-local)

`packages/fork/web-search-zai` is the fork-local web backend: z.ai search and page reading reached through MCP, registered on `ctx.web` and pinned by a profile layer. This page records what it changes relative to the upstream composition, how a profile turns it on, and which checks hold it. The [package README](../../packages/fork/web-search-zai/README.md) owns every accepted `Config` field and the internal design; the [fork group README](../../packages/fork/README.md) owns the rules for what may live in `packages/fork/`; [docs/subsystems/web.md](../subsystems/web.md) owns the request, result, selection, and error definitions of `ctx.web`.

## What differs from upstream

- Upstream ships no z.ai web backend. The base layer pins search to `deepseek-search-api` and fetch to `http`, mounting [dsh-web-deepseek-api](../../packages/web/web-deepseek-api/README.md), [dsh-web-search-deepseek](../../packages/web/web-search-deepseek/README.md), and [dsh-web-fetch-http](../../packages/web/web-fetch-http/README.md) — see [`packages/bundle/base/cordis.patch.yml`](../../packages/bundle/base/cordis.patch.yml).
- The fork adds `@local/dsh-web-search-zai`: two providers registered under the id `zai`, one in the search registry and one in the fetch registry, plus a bundle patch that pins both capabilities to that id. The package is `private` and scoped `@local` so it cannot be mistaken for a product package ([fork group README](../../packages/fork/README.md)).
- The transport is MCP over Streamable HTTP, not z.ai's REST endpoints. [`src/mcp.ts`](../../packages/fork/web-search-zai/src/mcp.ts) opens a `StreamableHTTPClientTransport` from `@modelcontextprotocol/client` and sends the key as an `authorization: Bearer` header; the MCP client negotiates the protocol revision and owns the `Mcp-Session-Id`.
- Search calls the tool `web_search_prime`; fetch calls `webReader` with `return_format: markdown`. The two endpoint URLs are constants in [`src/provider.ts`](../../packages/fork/web-search-zai/src/provider.ts) and are overridable through `Config`.
- The fork chooses MCP because the GLM Coding Plan meters MCP tool calls against plan credits, while z.ai's REST Web Search API bills per call; the trade-off and the case for adding the REST transport later are recorded in the [package README Dev Note](../../packages/fork/web-search-zai/README.md#dev-note).
- The model-facing tools do not change: `dsh-tool-web` keeps the `web_search` and `web_fetch` names, schemas, prompt guidance, and presentation ([stable registration](../../packages/web/tool-web/README.md#stable-registration), [tool catalog](../tool-catalog.md)), and [`scripts/verify-package-readme-model-experience.ts`](../../scripts/verify-package-readme-model-experience.ts) records this package's model experience as `indirect` for that reason.

## Behavior the fork selects on `ctx.web`

- One MCP session is cached per endpoint and per credential: repeated calls reuse it, a changed credential opens a new one, a failed call drops it so the next call reconnects, and the plugin closes both sessions when its fiber disposes through the effect named `web-search-zai.sessions` in [`src/index.ts`](../../packages/fork/web-search-zai/src/index.ts).
- Both tools return their payload as JSON text inside a JSON string, so the provider decodes twice before mapping; a search entry without a usable `link` is dropped rather than given an invented source ([`src/types.ts`](../../packages/fork/web-search-zai/src/types.ts) declares the two decoded payloads).
- The search tool accepts no result count and returns no publication date, so a query through this backend yields sources without `publishedAt` and can yield fewer than requested; the bound `dsh-tool-web` passes still truncates ([search request and result](../subsystems/web.md#search-request-and-result)).
- The reader reports `statusCode: 200` on success because `webReader` states extraction success rather than the page's HTTP status; that limitation and the rest of the field-level limits are owned by the [Known Limitations section](../../packages/fork/web-search-zai/README.md#known-limitations-and-deferred-work).
- Fetch falls back to the free anonymous fetcher [`dsh-web-fetch-http`](../../packages/web/web-fetch-http/README.md) when the paid read fails; search never falls back, because a second search backend would hide the subscription route the profile pinned. A cancellation (`WEB_ABORTED`) and an unresolvable credential (`WEB_PROVIDER_CONFIGURED_UNAVAILABLE`) do not trigger the fallback, and an endpoint that fails `URL.canParse` is rejected at plugin load instead of on the first call.
- Request modes and fallback caps — summary size, recency window, region hint, byte and character caps, deadlines, redirect count — are `Config` fields with defaults. The [package README table](../../packages/fork/web-search-zai/README.md#use-this-package) and the generated [`@local/dsh-web-search-zai` entry](../config-catalog.md#localdsh-web-search-zai) are their exhaustive source; this page does not restate them.

## Enabling the layer in a profile

- Installation is `dsh plugin --profile web add <checkout>/packages/fork/web-search-zai`. The resolver reads `dsh.bundle.patch` from [`package.json`](../../packages/fork/web-search-zai/package.json), records the package in the profile manifest, and the profile's next load activates the rows; the matching removal command is in [Install into a profile](../../packages/fork/web-search-zai/README.md#use-this-package).
- The layer pins `searchProvider: zai` and `fetchProvider: zai` on the `web` entry in [`cordis.patch.yml`](../../packages/fork/web-search-zai/cordis.patch.yml). Both pins are required: the base layer registers other usable providers, and a capability with several usable providers and no configured id returns `WEB_PROVIDER_AMBIGUOUS` ([provider availability and selection](../subsystems/web.md#provider-availability), [provider selection](../../packages/web/web/README.md#provider-selection)).
- The credential is the `ZAI_API_KEY` reference, resolved on every call through `credentialRef` from `dsh-credentials`. The same reference names the `zai` chat route in [`packages/llm/llm-pi-ai/src/provider-data.generated.ts`](../../packages/llm/llm-pi-ai/src/provider-data.generated.ts), so the key the Models page stores for z.ai chat also serves search and fetch; an unconfigured reference fails the call with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` rather than switching backends.
- A profile layer written after this one overrides either pin or any `Config` field. `dsh --profile web --dump-config` prints the mounted row, and the id `zai` appears in the Web search provider and Web fetch provider menus of the settings page, shown by id because the providers declare no `title` ([listing providers](../../packages/web/web/README.md#listing-providers)).

## Checks that hold the addition

- [`tests/zai.spec.ts`](../../packages/fork/web-search-zai/tests/zai.spec.ts) pins the payload decoding, the mapping of search entries and reader pages, the session cache across credential changes, each `WebError` code, and every fallback decision; one case mounts [`src/index.ts`](../../packages/fork/web-search-zai/src/index.ts) on the real `WebRuntime` with both ids pinned and shows `WEB_PROVIDER_CONFIGURED_MISSING` after the fiber disposes.
- [`tests/mcp.spec.ts`](../../packages/fork/web-search-zai/tests/mcp.spec.ts) drives the adapter against a real `@modelcontextprotocol/server` served over Streamable HTTP by [`tests/fixture.ts`](../../packages/fork/web-search-zai/tests/fixture.ts), which reproduces z.ai's tool names and double-encoded payloads and records the `authorization` header of every request.
- Both files run inside `pnpm run test` through the `packages/*/*/tests/**/*.spec.ts` include in [`vitest.config.ts`](../../vitest.config.ts), and `pnpm run test:coverage` applies its per-file full-coverage requirement to this package's `src`, excluding only the types-only [`src/types.ts`](../../packages/fork/web-search-zai/src/types.ts).
- [`tsconfig.host.json`](../../tsconfig.host.json) carries the package as a project reference, so `pnpm run typecheck` and `pnpm run build:check` compile it with the rest of the Host solution.
- [`scripts/product-package-policy.ts`](../../scripts/product-package-policy.ts) keeps the package in the `optional` category, which is what lets it stay out of default runtime reachability while remaining outside `packages/experimental/`.
- The README checks enumerate `packages/*/*/package.json`, so this fork group is included: `pnpm run doc-sync` runs [`scripts/verify-package-readme-limitations.ts`](../../scripts/verify-package-readme-limitations.ts) and [`scripts/verify-package-readme-model-experience.ts`](../../scripts/verify-package-readme-model-experience.ts) over the package, and the `verify-config-catalog` script keeps [`docs/config-catalog.md`](../config-catalog.md) equal to what [`scripts/gen-config-catalog.ts`](../../scripts/gen-config-catalog.ts) reads from `src/index.ts`. This page is checked by [`scripts/verify-md-wrap.ts`](../../scripts/verify-md-wrap.ts) and [`scripts/verify-md-links.ts`](../../scripts/verify-md-links.ts) inside `pnpm run test:docs`.
- [`scripts/translation-pairing.manifest.json`](../../scripts/translation-pairing.manifest.json) lists [`packages/fork/web-search-zai/README.md`](../../packages/fork/web-search-zai/README.md) as an exclusion, so the package and this page stay English-only with no `.zh.md` pair ([fork maintenance](../../AGENTS.md#fork-maintenance)). After an upstream merge [`scripts/fork-merge-ritual.sh`](../../scripts/fork-merge-ritual.sh) restores the group and regenerates the catalogs instead of carrying these rows by hand ([rationale](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md)).
- No shipped preset or bundle mounts the package, so `pnpm run test:snapshot` never loads it, and no e2e test sends a query to z.ai. The live contracts of `web_search_prime` and `webReader` are pinned only by the local fixture's payload format, so a change on the z.ai side appears at runtime as `WEB_PROVIDER_ERROR` or as a fallback read, not as a failed check.
