/**
 * fork-patch: composer-model-picker — see docs/reference/fork-composer-model-picker.md
 * and inline label extension. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalogModel, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from './directory.ts'

/** Catalog data for a model name inside the composer's existing controls. */
export interface ModelLabelOwner {
  /** Provider identity and localized display name; contains no connection configuration. */
  provider: Pick<ModelProviderGroup, 'id' | 'name'>
  /** The exact provider's model catalog entry. */
  model: ModelCatalogModel
  /** Composer chip caption or a selectable model row in the picker. */
  placement: 'trigger' | 'option'
  /** Whether this provider/model pair is the current selection. */
  selected: boolean
}

/** Data identifying a keyed contribution displayed as a detail pane of the model menu. */
export interface ModelMenuPaneRef {
  /** Registration key in conversation.input.model.pane; also marks its root button's data-model-menu-pane. */
  key: string
  /** Localized accessible name of the detail pane. */
  title: string
}

/** Selection state and feedback shared by menu option entries and detail panes. */
export interface ModelMenuControls {
  /** Whether the composer refuses changes, including while a model selection is saving. */
  locked: boolean
  /** Close the menu and focus its trigger synchronously before opening another overlay. */
  dismiss: () => void
  /** Report a failed selection through the menu owner's persistent toast. */
  reportFailure: (message: string) => void
}

/** Root-menu controls for opening plugin-owned settings panes. */
export type ModelMenuOptions = ModelMenuControls & {
  /**
   * Open pane.key in conversation.input.model.pane with pane.title as its localized accessible name.
   * The root button's data-model-menu-pane must match pane.key for focus return.
   */
  openPane: (pane: ModelMenuPaneRef) => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Session options appended after model and reasoning controls in the root menu. */
    'conversation.input.model.options': {
      kind: 'list'
      scope: 'session'
      owner: ModelMenuOptions
    }
    /**
     * Plugin-owned content displayed as a model-menu detail pane.
     * The pane places its own initial focus, for example with `autoFocus`; without one,
     * focus stays on the menu surface, where Escape and Shift+Tab still return to the root menu.
     */
    'conversation.input.model.pane': {
      kind: 'keyed'
      scope: 'session'
      owner: ModelMenuControls
    }
    /**
     * Non-interactive inline model label; selection controls remain owner-managed.
     * Without a contribution, the badge follows the catalog name in both the
     * composer chip and the picker rows.
     * @example
     * return {
     *   inject: ['slots'],
     *   apply(ctx) {
     *     ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register(
     *       { name: 'conversation.input.model.label' },
     *       ({ provider, model }) => React.createElement('span', { title: provider.name }, model.name),
     *     ))
     *   },
     * }
     */
    'conversation.input.model.label': {
      kind: 'single'
      scope: 'session'
      inline: true
      owner: ModelLabelOwner
    }
  }
}

/** A shortcut's request to open one Session's picker; `seq` distinguishes repeats of the same Session. */
export interface ModelPickerRequest {
  sessionId: SessionId
  seq: number
}

/** Injected business face of the composer model seat. */
export interface ModelSelectInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** The session's shared directory store (same instance the /model popup reads). */
  directory: SnapshotStore<ModelDirectoryState>
  /** Ensure the shared advisory catalog is loaded (errors land on the store). */
  load: () => void
  /**
   * Choose a catalog badge's provider-authored text for the active locale.
   * @param text - the badge's literal text or translations.
   * @returns the text to display.
   */
  resolveText: (text: NonNullable<ModelCatalogModel['badge']>['text']) => string
  /**
   * Select a complete provider/model/reasoning selection.
   * @param selection - model selection and optional adapter-owned effort.
   * @returns the Host outcome, or undefined when this Session cannot select a model.
   */
  select: (selection: ModelSelection) => Promise<RemoteResult<void> | undefined>
  /** Session owning this seat; scopes injected requests to the seat they target. */
  sessionId: SessionId
  /** Shortcut-owned open requests, bound as `usePickerRequest` by the renderer. */
  hooks: { pickerRequest: HostObservable<ModelPickerRequest | null> }
  /**
   * Retire one consumed open request so a later remount does not reopen the picker.
   * @param seq - the request's sequence number.
   */
  clearPickerRequest: (seq: number) => void
}
