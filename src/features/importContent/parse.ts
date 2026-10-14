/** Reads an uploaded file or pasted text as a WordPress export or a CSV file. */

import { parseCsvItems } from './csvItems'
import { parseWxr } from './wxr'
import type { ImportFormat, ParseResult } from './types'

/** Chooses the format from the file name first, then from the first characters. */
export function detectFormat(text: string, fileName?: string): ImportFormat {
  const name = (fileName ?? '').toLowerCase()
  if (name.endsWith('.xml')) return 'wxr'
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return 'csv'
  const start = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trimStart()
  return start.startsWith('<') ? 'wxr' : 'csv'
}

export function parseImportText(text: string, options: { fileName?: string; format?: ImportFormat } = {}): ParseResult {
  const format = options.format ?? detectFormat(text, options.fileName)
  return format === 'wxr' ? parseWxr(text) : parseCsvItems(text)
}