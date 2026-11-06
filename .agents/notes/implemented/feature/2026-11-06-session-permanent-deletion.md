# Agent Note: Permanent Session deletion from the sidebar

Status: implemented

## Problem

The sidebar offered archive and pin but no way to remove a Session for good. The old "Delete session" menu entry had been a visual placeholder, and the [archive feature note](../../archived/feature/2026-07-31-session-archive-global-set.md) recorded that product chose archiving so the log and Workspace accounting stay untouched. That left no supported path for a user who really wants the conversation and its history gone.

## Decision

Deletion is a first-class Host operation with one storage-owning step and explicit derived-state cleanup. `SessionPersistence.delete(id)` removes the backend's artifacts (the JSONL session directory and every stored generation), refuses while an in-process write handle or another process's kernel lease owns the session, and reports whether anything was removed; Workspace accounting, search indexes, and projection caches stay with their owners. `WorkspaceRegistry.forgetSession(id)` then drops the account slot, archive entry, and pin in their durable writes. The Session Controller's `session/delete` Remote ties them together and announces `api-session/removed` so clients drop the row.

A live Agent is the one resource that must be closed before the log can go. The Session Controller now keeps the `AgentHandle` for every Agent it creates or resumes; deletion closes an idle Agent immediately, and running work only after the caller passes `stopActivity`. The `session/live` refusal carries the activity and whether the Host owns the disposer, so the client can ask before stopping and can report an Agent it cannot close. The UI confirms every deletion with the Session title, lists running work before the stop hop, and keeps failures in the dialog.

The sidebar row actions became one inset strip ordered More, Pin/Unpin, Archive/Unarchive, Delete; the destructive row entry sits last in the context menu.

## Alternatives considered

Hiding the row without deleting the log would duplicate archiving and leave the user's actual request unresolved. Archiving first and deleting later adds a second state without protecting anything, because a deleted log cannot be recovered either way. Refusing deletion whenever any Agent is live is safe but leaves the common case — deleting a Session this window has open — unusable; keeping the owned handle closes that gap without bypassing the Agent capability contract.

## Consequences

Deleting a Session does not cascade to forked children, subagent Sessions, or content-addressed attachments, and it cannot close an Agent the controller did not create or resume (the caller is told to close it there). Empty project directories remain. A live Session open in another window is closed by the Host, so that window loses it as the price of the owner's deletion. The persistence seam gains an abstract method, so an out-of-tree backend must implement `delete`; the Client `ISessions` face gains one too.

Verification: `packages/session/session-persistence-jsonl/tests/delete.spec.ts`, `packages/workspace/workspace/tests/workspace.spec.ts` (forget), `packages/api/session-controller/tests/session-delete.host.spec.ts` (cold, live, stop, writer-held), `packages/client/ui-workspace/tests` (button, dialog, navigation orchestration, menu order), and `apps/web/tests/session-delete.e2e.ts` (confirm running work, stop, delete, reload).
