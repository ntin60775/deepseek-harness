---
description: "Fork-local z.ai profile layer: how this installation searches and reads pages through z.ai MCP tools, spending GLM Coding Plan credits instead of per-call API charges."
kind: "package-bundle"
---

# @local/dsh-web-search-zai

## Summary

This profile layer points both web capabilities at z.ai's MCP servers, using the `ZAI_API_KEY` the Models page already stores for chat. Search calls `web_search_prime`; fetch calls `webReader` and falls back to the free anonymous HTTP fetcher when the paid path fails. MCP tool calls are metered against GLM Coding Plan credits, which is why this fork uses MCP rather than z.ai's per-use REST tools. Install it into a profile that already mounts the base layer; it pins both providers, so a missing credential fails the tool call.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

```text
dsh plugin --profile web add /home/prog7/home/dev/contrib/forks/deepseek-harness/packages/fork/web-search-zai
dsh plugin --profile web remove @local/dsh-web-search-zai
```

The install resolves the package from the workspace, records it in the profile manifest, and selects its `dsh.bundle.patch` as a layer; the profile's next load activates the rows below. A package without that declaration cannot install this way.

### What you get

Two `ctx.web` providers (`zai` in both the search and fetch registries) and the bundle patch that pins both capabilities to them. `dsh-tool-web` keeps owning the model-facing tools; this layer only changes which backend serves them.

```yaml
- insert:
    - id: web-search-zai
      name: '@local/dsh-web-search-zai'
- id: web
  config:
    searchProvider: zai
    fetchProvider: zai
```

The API key comes from the `ZAI_API_KEY` credential reference the Models page writes for the `zai` model provider. A later profile layer can change `apiKeyRef`, the endpoints, or the limits below.

| Field | Default | Meaning |
|---|---|---|
| `apiKeyRef` | `ZAI_API_KEY` | Credential reference resolved on every call |
| `searchURL` | `https://api.z.ai/api/mcp/web_search_prime/mcp` | Search MCP endpoint |
| `readerURL` | `https://api.z.ai/api/mcp/web_reader/mcp` | Reader MCP endpoint |
| `timeoutMs` | `30000` | Per-call deadline handed to `tools/call` |
| `contentSize` | `medium` | Summary size: `medium` (400–600 words) or `high` (2500) |
| `recency` | `noLimit` | Search window: `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, `noLimit` |
| `location` | `us` | Region hint: `us` outside mainland China, `cn` inside |
| `fetchFallback` | `true` | Use the free HTTP fetcher when a reader call fails |
| `fallbackMaxResponseBytes` | `5000000` | Fallback fetcher response byte cap |
| `fallbackMaxBodyChars` | `100000` | Fallback fetcher decoded character cap |
| `fallbackTimeoutMs` | `30000` | Fallback fetcher deadline |
| `fallbackMaxRedirects` | `5` | Fallback fetcher same-origin redirect cap |

The generated [configuration catalog](../../../docs/config-catalog.md#localdsh-web-search-zai) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each provider keeps one MCP session per endpoint and credential: the first call connects through `@modelcontextprotocol/client`, later calls reuse the negotiated session, a changed credential reopens it, and a failed call drops it so the next call reconnects. The plugin disposes both sessions with its fiber.

`web_search_prime` returns its payload as JSON text inside a JSON string, so the provider decodes twice, drops entries without a link, and maps `title` and `content` to the seam's source fields. The tool accepts no result count and returns no publication date; `dsh-tool-web` still truncates to `maxResults`.

`webReader` returns the same double-encoded form with `content`, `title`, and `url`. The provider reports it as a `text` body with a synthetic `200` because the tool reports extraction success rather than the page's HTTP status. Cancellation never falls back, and a missing credential is a configuration error the fallback must not hide.

| File | Contents |
|---|---|
| `src/index.ts` | Plugin `name`/`inject`/`Config`/`apply`, credential wiring, fallback construction, session disposal |
| `src/provider.ts` | Search and fetch providers, payload mapping, session cache, error translation |
| `src/mcp.ts` | One adapter over the official MCP client: connect, `tools/call`, close |
| `src/types.ts` | Decoded payload shapes of the two tools (types only) |
| `cordis.patch.yml` | Bundle layer: mounts the plugin and pins both capabilities |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web subsystem](../../../docs/subsystems/web.md) — the seam's requests, results, selection rules, and errors.
- [`dsh-web`](../../web/web/README.md) — the service this package registers into.
- [`dsh-web-fetch-http`](../../web/web-fetch-http/README.md) — the free fetcher used as fallback.
- [`dsh-tool-web`](../../web/tool-web/README.md) — the model-facing tools, schemas, and guidance.
- [z.ai Web Search MCP](https://docs.z.ai/devpack/mcp/search-mcp-server.md) — upstream server and tool contract.
- [z.ai Coding Plan](https://docs.z.ai/devpack/overview.md) — how MCP tool calls consume plan credits.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which owns the model-facing schemas, prompt guidance, and result rendering; this package supplies only normalized sources and page text.

#### KV Cache effect

Each search or fetch is an independent MCP tool call, and the package contributes no request text of its own, so it cannot invalidate a reusable prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Fork-local, not product** — the package is private, scoped `@local`, and ships no Loader composition test; it is verified by mounting it in a profile and calling the tools.
- **No result count** — `web_search_prime` accepts no `count` argument and returned six results in probes; the seam truncates to `maxResults`, so a query can yield fewer sources than requested.
- **No publication date** — MCP results carry only `title`, `link`, `content`, and `refer`, so `web_search` shows no `publishedAt` for this provider.
- **Synthetic fetch status** — `webReader` reports extraction success, not the page's HTTP status, so every successful fetch surfaces as `200`; a blocked or missing page appears as a provider error or as the fallback's real status.
- **One session per credential** — a reconnect costs one extra handshake; a long-idle session is not refreshed proactively and is reopened only after a failed call.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The fork uses MCP because the Coding Plan meters MCP tool calls against plan credits, while z.ai's REST Web Search API is billed per use ($0.01). The REST route also offers `count` and `publish_date`; add it as a configurable transport only if a deployment needs those fields and accepts the charge.

</details>