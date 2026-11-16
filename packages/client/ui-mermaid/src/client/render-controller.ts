/** Owner-instance render controller: one lifecycle controller per attempt, serialized across cards. */
import type { MermaidThemeVariables } from './theme-variables.ts'

/** Outcome of one render attempt; stale results never reach the card body. */
export type MermaidRenderResult =
  | { readonly kind: 'rendered'; readonly svg: string }
  | { readonly kind: 'stale' }
  | { readonly kind: 'failed' }

/** One attempt's lifecycle handle: its result promise and its cancellation. */
export interface MermaidAttempt {
  /** Settles exactly once; a cancelled or superseded attempt settles `stale`. */
  readonly promise: Promise<MermaidRenderResult>
  /** Cancel the attempt; a running render's result is discarded on arrival. */
  cancel(): void
}

/** Dependencies the apply closure supplies to the controller instance. */
export interface MermaidRenderControllerOptions {
  /** Read the resolved theme variables at the render operation's async step. */
  resolveVariables(): MermaidThemeVariables
  /** Publish the resolved variables through the inject hooks compartment. */
  publishVariables(variables: MermaidThemeVariables): void
}

/** Render controller owned by one plugin apply; never a module singleton. */
export interface MermaidRenderController {
  /** Start one attempt for a settled fence; attempts run one at a time in call order. */
  attempt(code: string): MermaidAttempt
  /** Invalidate every in-flight attempt: a theme change starts a new generation. */
  themeChanged(): void
  /** Release the controller; pending attempts settle `stale`. */
  dispose(): void
}

/**
 * Create the render controller. The mermaid entry loads lazily once; a failed
 * import is not retried inside the attempt, and the next attempt (a new mount)
 * imports again. Mermaid's singleton database and mutable config force the
 * serialization this instance owns.
 * @param options - theme resolution and publication supplied by apply.
 * @returns the controller instance.
 */
export function createMermaidRenderController(options: MermaidRenderControllerOptions): MermaidRenderController {
  let generation = 0
  let sequence = 0
  let disposed = false
  let queue: Promise<void> = Promise.resolve()
  let entry: Promise<typeof import('./mermaid-entry.ts')> | undefined
  return {
    attempt(code) {
      const token = generation
      const id = `dsh-mermaid-${++sequence}`
      let cancelled = false
      const stale = (): boolean => cancelled || disposed || token !== generation
      const promise = new Promise<MermaidRenderResult>((resolve) => {
        queue = queue.then(async () => {
          if (stale()) { resolve({ kind: 'stale' }); return }
          let module: typeof import('./mermaid-entry.ts')
          try {
            entry ??= import('./mermaid-entry.ts')
            module = await entry
          } catch {
            // A rejected import stays unretried here; the next attempt re-imports.
            entry = undefined
            resolve({ kind: 'failed' })
            return
          }
          if (stale()) { resolve({ kind: 'stale' }); return }
          try {
            const variables = options.resolveVariables()
            options.publishVariables(variables)
            const svg = await module.renderMermaid(id, code, variables)
            resolve(stale() ? { kind: 'stale' } : { kind: 'rendered', svg })
          } catch {
            resolve(stale() ? { kind: 'stale' } : { kind: 'failed' })
          }
        })
      })
      return { promise, cancel: () => { cancelled = true } }
    },
    themeChanged() { generation += 1 },
    dispose() { disposed = true },
  }
}
