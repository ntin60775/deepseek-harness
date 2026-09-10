/** Locale namespace of the status band: accessible names only, because every
 * visible token is a glyph or a formatted number. */
export const NS = 'status.line'

/** English copy. */
export const en = {
  'line': 'Session status',
  'context': 'Context occupancy',
  'input': 'Input tokens',
  'output': 'Output tokens',
} as const

/** Chinese copy. */
export const zh: Record<keyof typeof en, string> = {
  'line': '会话状态',
  'context': '上下文占用',
  'input': '输入 token',
  'output': '输出 token',
}

/** Keys of the status-line namespace. */
export type StatusLineKey = keyof typeof en
