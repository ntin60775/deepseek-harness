/**
 * Configuration normalization for `.omp` rule discovery and rendering.
 *
 * @module @deepseek-ai/dsh-agent-rules/config
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { expandHomePath } from '@deepseek-ai/dsh-home-paths'

const DEFAULT_PROJECT_ROOT_MARKERS = ['.git'] as const
const DEFAULT_MAX_SOURCE_BYTES = 1_048_576
const DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500
/** Environment variable that relocates the omp user agent directory, honored for omp interop. */
export const OMP_AGENT_DIR_ENV = 'PI_CODING_AGENT_DIR'
const DEFAULT_OMP_AGENT_DIR_SEGMENTS = ['.omp', 'agent'] as const

/** User-facing agent rules loader configuration. */
export interface Config {
  /**
   * omp user agent directory holding `rules/` and `RULES.md`; defaults to
   * `PI_CODING_AGENT_DIR` when set, otherwise `~/.omp/agent`. `~` prefixes expand.
   */
  ompAgentDir?: string
  /** Directory entries that identify the project root while walking upward from the session cwd. */
  projectRootMarkers?: string[]
  /** UTF-8 byte cap for one rendered rule context message; non-positive or non-finite disables loading. */
  maxBytes: number
  /** Maximum UTF-8 bytes read from one rule file; larger files are ignored. */
  maxSourceBytes?: number
  /** Maximum normalized description length rendered per rulebook entry; minimum 3. */
  catalogDescriptionMaxLength?: number
}

export const Config: z<Config> = z.object({
  ompAgentDir: z.string(),
  projectRootMarkers: z.array(z.string()).default([...DEFAULT_PROJECT_ROOT_MARKERS]),
  maxBytes: z.number().required(),
  maxSourceBytes: z.number().step(1).min(1).default(DEFAULT_MAX_SOURCE_BYTES),
  catalogDescriptionMaxLength: z.number().step(1).min(3).default(DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH),
})

/** Normalized rule discovery and rendering configuration. */
export interface ResolvedConfig {
  /** Absolute omp user agent directory. */
  ompAgentDir: string
  /** Model-facing display form of the omp user agent directory. */
  ompAgentDirDisplay: string
  projectRootMarkers: string[]
  maxBytes: number
  maxSourceBytes: number
  catalogDescriptionMaxLength: number
}

/**
 * Resolve the omp user agent directory: explicit configuration first, then the
 * omp relocation environment variable, then the conventional `~/.omp/agent`.
 * @param configured - optional configured directory; `~` prefixes expand.
 * @param env - environment consulted for `PI_CODING_AGENT_DIR`.
 * @returns the absolute omp user agent directory.
 */
export function resolveOmpAgentDir(
  configured?: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const selected = configured ?? env[OMP_AGENT_DIR_ENV]
  if (selected !== undefined && selected.trim().length > 0) return expandHomePath(selected)
  return join(homedir(), ...DEFAULT_OMP_AGENT_DIR_SEGMENTS)
}

/**
 * Render the omp user agent directory for model-facing display, collapsing the
 * OS home directory to `~` when the directory lives beneath it.
 * @param ompAgentDir - absolute resolved omp user agent directory.
 * @returns the display form of the directory.
 */
export function ompAgentDirDisplay(ompAgentDir: string): string {
  const home = homedir()
  if (ompAgentDir === home) return '~'
  if (ompAgentDir.startsWith(`${home}/`)) return `~/${ompAgentDir.slice(home.length + 1)}`
  return ompAgentDir
}

/**
 * Resolve defaults and derived display forms for the plugin configuration.
 * @param config - user-facing plugin configuration.
 * @returns normalized runtime configuration.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const ompAgentDir = resolveOmpAgentDir(config.ompAgentDir)
  return {
    ompAgentDir,
    ompAgentDirDisplay: ompAgentDirDisplay(ompAgentDir),
    projectRootMarkers: config.projectRootMarkers ?? [...DEFAULT_PROJECT_ROOT_MARKERS],
    maxBytes: config.maxBytes,
    maxSourceBytes: config.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES,
    catalogDescriptionMaxLength: config.catalogDescriptionMaxLength ?? DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH,
  }
}
