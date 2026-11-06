/** Permanent-delete hover button and confirmation dialog for Session logs. */
import { useState } from 'react'
import {
  Button, IconTrashOutlineRegular, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import type {
  DeleteSessionInjected, SessionDeleteConfirmInjected, SessionDeleteConfirmProps, SessionDeleteConfirmRequest,
  SessionDeleteOutcome, SessionRowActionProps,
} from '../contract/slots.ts'
import css from '../rows/Rows.module.css'
import browserCss from '../rows/WorkspaceBrowser.module.css'
import { activityLine } from './ArchiveSession.tsx'

/**
 * Hover button (order 300): permanently delete the Session. Absent while the
 * Session's access snapshot excludes `session/delete`.
 * @param props - owner share, the access Hook, and the delete share.
 * @returns the button, or nothing when the caller may not delete this Session.
 */
export function DeleteSessionRowButton({
  sessionId, displayTitle, useSessionAccess, requestDeleteSession, t,
}: SessionRowActionProps<DeleteSessionInjected>) {
  const allowed = useSessionAccess(sessionId, 'session/delete')
  if (!allowed) return null
  return (
    <Tooltip label={t('actions.delete')} side="bottom" align="end" delayMs={500} portal>
      <button
        type="button"
        className={clsx(css.iconButton, css.deleteAction)}
        aria-label={t('menu.deleteSession')}
        onClick={() => { requestDeleteSession(sessionId, displayTitle) }}
      >
        <IconTrashOutlineRegular size={14} />
      </button>
    </Tooltip>
  )
}

/**
 * The `shell.overlay` entry: nothing while no confirmation is pending,
 * otherwise one dialog per request (keyed by the Session). The first attempt
 * asks the Host to delete; a Session with running work switches the dialog to
 * the stop-and-delete confirmation, whose stop hop asks the Host to stop that
 * work and close the live Agent before removing the log.
 * @param props - the request hook, its settlement, both delete hops, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useDeleteRequest, settleSessionDelete, deleteSession, stopAndDeleteSession, t,
}: SessionDeleteConfirmProps) {
  const request = useDeleteRequest(pending => pending)
  if (request === null) return null
  return (
    <DeleteConfirmForm
      key={request.sessionId}
      request={request}
      deleteSession={deleteSession}
      stopAndDeleteSession={stopAndDeleteSession}
      onSettle={settleSessionDelete}
      t={t}
    />
  )
}

/** One request's dialog: its busy, pending, and error state die with it. */
function DeleteConfirmForm({ request, deleteSession, stopAndDeleteSession, onSettle, t }: {
  request: SessionDeleteConfirmRequest
  deleteSession: SessionDeleteConfirmInjected['deleteSession']
  stopAndDeleteSession: SessionDeleteConfirmInjected['stopAndDeleteSession']
  onSettle: () => void
  t: SessionDeleteConfirmProps['t']
}) {
  const [busy, setBusy] = useState<Extract<SessionDeleteOutcome, { kind: 'busy' }> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stopping = busy !== null
  const close = () => {
    if (pending) return
    onSettle()
  }
  const run = (operation: () => Promise<SessionDeleteOutcome>) => {
    setPending(true)
    setError(null)
    operation().then((outcome) => {
      setPending(false)
      if (outcome.kind === 'deleted') {
        onSettle()
        return
      }
      setBusy(outcome)
    }).catch((reason: unknown) => {
      setPending(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  const confirm = () => {
    run(stopping
      ? () => stopAndDeleteSession(request.sessionId)
      : () => deleteSession(request.sessionId))
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('delete.confirm.title')}
      description={t('delete.confirm.desc', { title: request.displayTitle })}
      footer={(
        <>
          <Button variant="outline" disabled={pending} onClick={close}>{t('cancel')}</Button>
          {busy?.canStop === false ? null : (
            <Button
              variant="outline"
              className={browserCss.deleteAction}
              disabled={pending}
              onClick={confirm}
            >
              {t(stopping ? 'delete.confirm.stopAction' : 'delete.confirm.action')}
            </Button>
          )}
        </>
      )}
    >
      {busy !== null && busy.activity.length > 0 && (
        <ul className={browserCss.archiveActivity} aria-label={t('archive.confirm.activity')}>
          {busy.activity.map((entry, index) => (
            <li key={`${entry.kind}-${String(index)}`}>{activityLine(entry, t)}</li>
          ))}
        </ul>
      )}
      {busy !== null && !busy.canStop && (
        <div className={browserCss.renameError} role="alert">{t('delete.confirm.openElsewhere')}</div>
      )}
      {pending && (
        <div className={browserCss.deleteStatus} role="status">
          {t(stopping ? 'delete.confirm.stopping' : 'delete.confirm.pending')}
        </div>
      )}
      {error !== null && <div className={browserCss.renameError} role="alert">{error}</div>}
    </Modal>
  )
}
