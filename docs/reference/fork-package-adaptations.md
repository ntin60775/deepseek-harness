---
node_type: reference
title: Fork-local package adaptations in liveshare, conversation, feedback, inspect catalogs, and the client test runtime
service: _platform
status: active
updated: 2026-11-10
tags: [fork, packages, adaptation]
links:
  documents:
    - ../../packages/experimental/liveshare/src/endpoint-classification.ts
    - ../../packages/experimental/liveshare/src/client/endpoint-classification.ts
    - ../../packages/experimental/liveshare/src/host/viewer-access-policy.ts
    - ../../packages/client/ui-conversation/tests/conversation-registry.client.spec.ts
    - ../../packages/feedback/message-feedback/tests/helpers.ts
    - ../../packages/extensions/tool-cordis/src/api-catalog.ts
    - ../../packages/extensions/cordis-client-runner/src/client/api-catalog.ts
    - ../../packages/test-support/client-runtime/src/sessions.ts
    - ../../scripts/gen-cordis-catalog.ts
    - ../../scripts/gen-cordis-inspect-catalog.ts
  part_of: [README.md]
  relates_to:
    - fork-session-permanent-deletion.md
    - ../subsystems/liveshare.md
    - ../subsystems/persistence.md
    - ../subsystems/extensions.md
    - ../../packages/experimental/liveshare/README.md
    - ../../packages/client/ui-conversation/README.md
    - ../../packages/feedback/message-feedback/README.md
    - ../../packages/extensions/tool-cordis/README.md
    - ../../packages/extensions/cordis-client-runner/README.md
    - ../../packages/test-support/client-runtime/README.md
---

# Fork-local package adaptations in liveshare, conversation, feedback, inspect catalogs, and the client test runtime

Six package paths in this checkout differ from `upstream/master` in ways their own package documents do not describe. Every difference follows one fork-local API addition — permanent Session deletion: `ISessions.delete` in [contract/sessions.ts](../../packages/api/session-controller/src/client/contract/sessions.ts), the `session/delete` Remote command, and the abstract `SessionPersistence.delete` in [packages/session/session-persistence/src/index.ts](../../packages/session/session-persistence/src/index.ts) — and none of them adapts this checkout to a change made upstream: reading those sources at `upstream/master` finds no `delete` member and no `session/delete` action. [Permanent Session deletion from the sidebar (fork-local)](fork-session-permanent-deletion.md) owns the deletion path, its refusals, and its tests; this page records the per-package difference and names the document or the executed check that owns each described rule.

## Scope read

- `git diff --name-only upstream/master...HEAD -- <package path>` returns exactly one file for each of the six paths, and every hunk in those files is described below: [endpoint-classification.ts](../../packages/experimental/liveshare/src/endpoint-classification.ts), [conversation-registry.client.spec.ts](../../packages/client/ui-conversation/tests/conversation-registry.client.spec.ts), [helpers.ts](../../packages/feedback/message-feedback/tests/helpers.ts), [api-catalog.ts](../../packages/extensions/tool-cordis/src/api-catalog.ts), [client/api-catalog.ts](../../packages/extensions/cordis-client-runner/src/client/api-catalog.ts), [sessions.ts](../../packages/test-support/client-runtime/src/sessions.ts).
- No other file under `packages/experimental/liveshare`, `packages/client/ui-conversation`, `packages/feedback/message-feedback`, `packages/extensions/tool-cordis`, `packages/extensions/cordis-client-runner`, or `packages/test-support/client-runtime` differs from `upstream/master`, so each section below is the complete difference for that package.

## packages/experimental/liveshare

- One added row in the `VIEWER_ENDPOINT_CLASSES` table, `'session/delete': 'owner-only', // owner permanently deletes a Session`, beside the other `session/*` owner-only rows in [src/endpoint-classification.ts](../../packages/experimental/liveshare/src/endpoint-classification.ts).
- The row is required by a completeness check, not chosen feature by feature: the fork's `session/delete` Remote method enters the generated Remote map, the map is `RemoteEndpoint`, and [src/client/endpoint-classification.ts](../../packages/experimental/liveshare/src/client/endpoint-classification.ts) declares `COMPLETE_VIEWER_ENDPOINT_CLASSES = VIEWER_ENDPOINT_CLASSES satisfies Record<RemoteEndpoint, ViewerEndpointClass>`, so an endpoint the generated map names but the table omits fails the package's Client compilation face rather than reaching a runtime refusal.
- The chosen class changes no action that a reader may call: `owner-only` is not a `reader-*` entry, `readerPolicyEndpoints` filters on that prefix, so `POLICY_DECIDED_ACTIONS` in [src/host/viewer-access-policy.ts](../../packages/experimental/liveshare/src/host/viewer-access-policy.ts) names the same actions as before and its load-time `assertSameViewerActions` call still passes. A share viewer cannot delete a Session: no reader role lists `session/delete`, and an action no role lists stays refused.
- Verified by: the `satisfies` declaration above, compiled by `pnpm run typecheck` and `pnpm run build:check`, plus [tests/endpoint-classification.client.spec.ts](../../packages/experimental/liveshare/tests/endpoint-classification.client.spec.ts) and [tests/endpoint-classification.spec.ts](../../packages/experimental/liveshare/tests/endpoint-classification.spec.ts) for the drift diagnostics that `assertSameViewerActions` reports.
- Not pinned by name: [tests/viewer-access-policy.spec.ts](../../packages/experimental/liveshare/tests/viewer-access-policy.spec.ts) iterates owner-only actions including `session/create` and `session/search` in its global-resource refusals, and `session/delete` is not one of the actions it lists.
- The classification types and the `share-viewer` policy that consumes them belong to the [liveshare package README](../../packages/experimental/liveshare/README.md) and [docs/subsystems/liveshare.md](../subsystems/liveshare.md).

## packages/client/ui-conversation

- The single added line is one member of the `fakeSessions` object literal in [tests/conversation-registry.client.spec.ts](../../packages/client/ui-conversation/tests/conversation-registry.client.spec.ts): `delete: () => Promise.reject(new Error('unused fake Sessions operation'))`, the same answer that fake already gives to `refreshProjections`, `refresh`, `search`, and `fork`.
- Nothing in the package's behavior changes: the annotated literal `const sessions: ISessions` must name every member of `ISessions`, and `delete(sessionId, options?)` is one of them since [contract/sessions.ts](../../packages/api/session-controller/src/client/contract/sessions.ts) declares it. This package's source reads `list`, `scope`, `binding`, and `sessionOf` on the injected Sessions face and calls no `delete`.
- Verified by compilation of that spec through the Client aggregate of the root `tsconfig.client.json`, which `pnpm run typecheck` and `pnpm run build:check` run; [tests/conversation-registry.client.spec.ts](../../packages/client/ui-conversation/tests/conversation-registry.client.spec.ts) then runs unchanged under `pnpm run test`.
- The Conversation registries themselves are owned by the [ui-conversation README](../../packages/client/ui-conversation/README.md); deletion behavior is owned by [fork-session-permanent-deletion.md](fork-session-permanent-deletion.md).

## packages/feedback/message-feedback

- [tests/helpers.ts](../../packages/feedback/message-feedback/tests/helpers.ts): the in-memory `TestPersistence extends SessionPersistence` defines `async delete(id: SessionId): Promise<boolean> { return this.durable.delete(id) }`, where `durable` is the `Map<SessionId, StoredSession>` that already backs `create`, `open`, `stat`, and `list` in that fixture.
- The member is required because `SessionPersistence` declares `abstract delete(id: SessionId, options?: SessionPersistenceDeleteOptions): Promise<boolean>`; the method's meaning — `true` when a stored session was removed, `false` for an unknown id, and no cleanup of registry, search, or projection state — is owned by [docs/subsystems/persistence.md](../subsystems/persistence.md), and `Map.prototype.delete` already returns exactly that boolean.
- Fixture effect: after one `delete` the row is gone from the map, so `stat` resolves `undefined`, `list` omits the id, and `open` throws `SessionPersistenceNotFoundError`. No source file of the package changed.
- No feedback spec exercises it: the `delete` calls in [tests/message-feedback.spec.ts](../../packages/feedback/message-feedback/tests/message-feedback.spec.ts) are `ctx.messageFeedback.delete`, the message-row verb, which is unrelated to Session deletion.
- The service and its log rules belong to the [message-feedback README](../../packages/feedback/message-feedback/README.md) and [docs/subsystems/feedback.md](../subsystems/feedback.md).

## packages/extensions/tool-cordis

- [src/api-catalog.ts](../../packages/extensions/tool-cordis/src/api-catalog.ts) differs by three generated service methods and three generated type declarations and nothing else: `@Remote('delete') delete(request: SessionDeleteRequest): Promise<SessionDeleteValue>` under the `sessionController` key, `abstract delete(id: SessionId, options?: SessionPersistenceDeleteOptions): Promise<boolean>` under `sessionPersistence`, `forgetSession(sessionId: SessionId): Promise<void>` under `workspaceRegistry`, plus `SessionDeleteRequest`, `SessionDeleteValue`, and `SessionPersistenceDeleteOptions` in `TYPE_API`.
- The file's header comment states that the module is generated and must not be edited by hand: [scripts/gen-cordis-catalog.ts](../../scripts/gen-cordis-catalog.ts) writes it, the compatibility entry `scripts/gen-cordis-api.ts` calls that same `main()`, and the text of each added entry is the JSDoc of the fork's own source, produced by the same AST walk that renders the generated Cordis API document sections.
- Effect: `cordis_inspect` answers a model that queries those services or types with the deletion methods included, so plugin code written in this checkout sees the same API the fork runs. The read-only limits of inspect are unchanged; [docs/subsystems/extensions.md](../subsystems/extensions.md) and the [tool-cordis README](../../packages/extensions/tool-cordis/README.md) own the catalog and the tool.
- Verified by `pnpm run verify-cordis-catalog`, the `--check` run of the same generator, executed by `pnpm run doc-sync`.

## packages/extensions/cordis-client-runner

- [src/client/api-catalog.ts](../../packages/extensions/cordis-client-runner/src/client/api-catalog.ts) differs by one generated line: the `ISessions` entry of `TYPE_API` carries `delete(sessionId: SessionId, options?: { readonly stopActivity?: boolean }): Promise<void>;` between `create` and `subagentAddress`.
- Same generator chain and the same reason as the Host-side catalog: [scripts/gen-cordis-inspect-catalog.ts](../../scripts/gen-cordis-inspect-catalog.ts) projects the Client face of the harness API, and the mirrored declaration is stale as soon as `ISessions` gains a member.
- Effect: a Client-side inspect of `ISessions` names `delete` to whoever is writing the browser half in this checkout; the runner's own behavior is unchanged. The [cordis-client-runner README](../../packages/extensions/cordis-client-runner/README.md) owns what this package does with the catalog.
- Verified by `pnpm run verify-cordis-inspect-catalog`, the `--check` run of the same generator, executed by `pnpm run doc-sync`.

## packages/test-support/client-runtime

- [src/sessions.ts](../../packages/test-support/client-runtime/src/sessions.ts): `TestSessions implements ISessions` declares the `delete` method, the private `deleteStub` field, the `stubDelete(impl)` setter, and `'delete'` as one value of the recorded `calls` method union.
- Recording is narrower than the interface: the call pushes `{ method: 'delete', args: [sessionId] }`, so a spec asserting `runtime.sessions.calls` sees the id and never the `stopActivity` option.
- Default behavior: an installed `stubDelete` implementation decides success or a refusal, as the Host would; without one, an id absent from the fixture's `records` map throws `test sessions: unknown session "<id>"`, and a catalogued id goes through the existing `remove(id)`, which drops the catalog row and marks a retained generation `removed` without releasing its owners.
- No caller in this checkout uses the new members: a repository-wide search for `stubDelete` finds only its declaration in `src/sessions.ts`, and the Session-deletion specs in `packages/client/ui-workspace` drive their own literal `ISessions` fake with a recorded `deleteCalls` list in [packages/client/ui-workspace/tests/workspaces-service.client.spec.ts](../../packages/client/ui-workspace/tests/workspaces-service.client.spec.ts).
- Verified by compilation of `src/sessions.ts` and its Client specs through `pnpm run typecheck` and `pnpm run build:check`; the fixture rules — missing services and unstubbed calls fail loudly — are owned by the [client-runtime README](../../packages/test-support/client-runtime/README.md).
