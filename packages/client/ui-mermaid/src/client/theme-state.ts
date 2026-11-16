/** Registrant-private theme channel published through the inject hooks compartment. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { MermaidThemeVariables } from './theme-variables.ts'

/** Immutable theme fact the fence card selects from: revision drives re-render attempts. */
export interface MermaidThemeState {
  /** Monotonic theme revision; a change starts a new render attempt. */
  readonly revision: number
  /** Variables resolved by the latest render operation's async step; undefined until then. */
  readonly variables: MermaidThemeVariables | undefined
}

/** Theme channel handle owned by one plugin apply. */
export interface MermaidThemeChannel {
  /** Stable observable source bound by the renderer into `useMermaidTheme`. */
  readonly source: ObservableSnapshot<MermaidThemeState>
  /** Publish a theme change: new revision, resolved variables cleared until the next render. */
  change(snapshot: ThemeSnapshot): void
  /** Publish the variables resolved by a render operation at its commit point. */
  publishVariables(variables: MermaidThemeVariables): void
}

/**
 * Create the theme channel with the initial snapshot read from the theme service.
 * @param initial - theme snapshot at apply time (`ctx.theme.getTheme()`).
 * @returns the channel whose source keeps one identity and one snapshot reference between changes.
 */
export function createMermaidThemeChannel(initial: ThemeSnapshot): MermaidThemeChannel {
  let state: MermaidThemeState = { revision: initial.revision, variables: undefined }
  const listeners = new Set<() => void>()
  const publish = (next: MermaidThemeState): void => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    source: {
      getSnapshot: () => state,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    change: (snapshot) => { publish({ revision: snapshot.revision, variables: undefined }) },
    publishVariables: (variables) => { publish({ revision: state.revision, variables }) },
  }
}
