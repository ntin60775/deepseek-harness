---
node_type: runbook
title: Pin a per-model reasoning default on a pi-ai provider route
service: ops
status: active
updated: 2026-11-10
tags: [llm, pi-ai, reasoning-effort, provider-config, alibaba, qwen]
links:
  part_of: [README.md]
  depends_on: [../user/guide/providers.md]
  relates_to: [../../packages/llm/llm-pi-ai/README.md]
  implemented_by: [../../packages/llm/llm-pi-ai/src/catalog.ts, ../../packages/llm/llm-pi-ai/src/adapter.ts]
---

# Pin a per-model reasoning default on a pi-ai provider route

A route's reasoning default is one route-level field, so the models sharing that route must all accept it. `dsh-llm-pi-ai` reads `providers.<route>.reasoning` through `describableReasoningLevel`, which keeps the level only when that exact model declares it; the picker then hides its provider-default row because [`reasoningInfo`](../../packages/llm/llm-pi-ai/src/adapter.ts) sets `reasoning.defaultEffort` ([`ModelSelect.tsx`](../../packages/client/ui-model-selection/src/client/ModelSelect.tsx)). A route naming a level its model rejects keeps that row visible, and choosing it — like any request that names no effort — fails `UNSUPPORTED_REASONING_EFFORT` in `resolveReasoningLevel`. Levels narrow the same way: `resolveModelReasoning` pins every level a model's `reasoningEfforts` dict omits to unsupported instead of inheriting the installed catalog's, so an undeclared level leaves the menu. One route per distinct default is therefore how you exclude a level on every model and still hide the provider-default row.

## Procedure

1. Read the live layer at `$DSH_HOME/profiles/<profile>/cordis.patch.yml`, entry `llm-pi-ai`, key `config.providers.<route>`.
2. Establish what each model accepts. On a catalog route an entry that names no `reasoningEfforts` inherits the installed pi-ai catalog map in `packages/llm/llm-pi-ai/node_modules/@earendil-works/pi-ai/dist/providers/data/<route>.json`, where a `null` level is unsupported and an `off` key with no value is supported with no wire spelling. On a hand-declared route the entry states the levels itself.
3. Choose the offered levels and take the route's `reasoning` from that same list.
4. Split the route once per distinct default. A route the catalog does not ship restates `api`, `baseURL`, and the model's `compat`, because it inherits nothing; a route the catalog does ship may override `baseURL` alone. Naming `maxTokens` on an entry also makes it that model's per-request output cap.
5. Re-point every reference to a moved model: `agent-default-model`, `subagent-model-selection-settings.allowedModels`, and any session selection that names the old route.
6. Reload the layer — restart `dsh web`, or save any setting, because a settings write re-reads the whole patch file — then verify in the picker: each model shows exactly its declared levels with no provider-default row, and a session that selects no effort completes instead of failing `UNSUPPORTED_REASONING_EFFORT`.

## Alibaba Qwen Token Plan on this machine

`$DSH_HOME/profiles/web/cordis.patch.yml` serves `qwen3.8-flash`, `qwen3.8-max`, and `deepseek-v4.1-flash-1017` from one endpoint across three routes under the same `QWEN_TOKEN_PLAN_API_KEY` credential reference and the same `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` base URL. Each model excludes `low` through its declared levels, and each route names a default its own model declares:

| Route | Model | Offered levels | Route `reasoning` |
|---|---|---|---|
| `qwen-token-plan` | `qwen3.8-flash` | `medium`, `xhigh` | `xhigh` |
| `qwen-token-plan-max` | `qwen3.8-max` | `medium`, `xhigh` | `medium` |
| `qwen-token-plan-deepseek` | `deepseek-v4.1-flash-1017` | `high`, `max` | `high` |

`qwen-token-plan` is the catalog route and inherits `compat`; the other two declare `api: openai-completions` and repeat the catalog `compat` block (`thinkingFormat: qwen`, `supportsReasoningEffort: true`, `supportsStrictMode: true`, `supportsStore: false`, `supportsDeveloperRole: false`). `agent-default-model` names `qwen-token-plan` / `qwen3.8-flash`, and `subagent-model-selection-settings.allowedModels` names `qwen-token-plan-max` for `qwen3.8-max`.

## Consequences

- A session recorded against the old route and a moved model id resolves no model after a split, so the human re-picks the model once; stored history is unaffected.
- Nothing interrogates the endpoint for the levels its models accept: the accepted set is the installed pi-ai catalog's claim plus this deployment's declarations, so a provider that starts rejecting a level surfaces as a request failure rather than a load-time refusal.
