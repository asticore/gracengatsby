/**
 * Client calls the builder's translate mode makes. The server is the only place
 * the review rules are enforced (evaluateTranslationWrite, the bulk route), so
 * these functions only send what the person asked for and report the refusal.
 */

import { errorMessageFrom } from '@/features/multilingual/views/TranslationStatusBadge'
import type { CanvasTextCell } from './translateCanvas'

const API = '/api/translations'
const BULK = '/api/admin-translations'
const MACHINE = '/api/admin-machine-translation'

async function request(method: 'POST' | 'PATCH', url: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await response.json().catch((): null => null)
  if (!response.ok) throw new Error(errorMessageFrom(data, `Could not save (${response.status}).`))
  return data
}

/**
 * Saves one text in one language. A row that exists is patched; a missing one is
 * created with the same collection source the translations screen uses.
 */
export function saveCellText(args: {
  cell: Pick<CanvasTextCell, 'fieldPath' | 'rowId' | 'sourceText'>
  locale: string
  sourceId: string
  value: string
}): Promise<unknown> {
  const { cell, locale, sourceId, value } = args
  if (cell.rowId !== null) {
    return request('PATCH', `${API}/${cell.rowId}`, { value, sourceText: cell.sourceText })
  }
  return request('POST', API, {
    locale,
    sourceKind: 'collection',
    sourceId,
    fieldPath: cell.fieldPath,
    value,
    sourceText: cell.sourceText,
  })
}

/** Sets a stored text's status without changing its text (Request review). */
export function setCellStatus(cell: Pick<CanvasTextCell, 'rowId' | 'sourceText' | 'value'>, status: 'needs_review' | 'approved'): Promise<unknown> {
  if (cell.rowId === null) return Promise.reject(new Error('Save a translation for this text first.'))
  return request('PATCH', `${API}/${cell.rowId}`, { status, sourceText: cell.sourceText, value: cell.value })
}

/** Runs one bulk action over this document in one language (the route the Translations screen uses). */
export async function runBulkForDocument(args: {
  action: 'approve' | 'translate'
  sourceId: string
  locale: string
}): Promise<{ updated: number; skipped: number; refused: string[] }> {
  const data = (await request('POST', BULK, {
    action: args.action,
    items: [`collection:${args.sourceId}`],
    locales: [args.locale],
  })) as { updated?: number; skipped?: number; refused?: string[] } | null
  return { updated: data?.updated ?? 0, skipped: data?.skipped ?? 0, refused: data?.refused ?? [] }
}

/** This month's machine usage, or null when the viewer may not read it. */
export async function fetchMachineUsage(): Promise<{ usedChars: number; monthlyCharLimit: number } | null> {
  const response = await fetch(MACHINE, { credentials: 'include' }).catch((): null => null)
  if (!response || !response.ok) return null
  const data = (await response.json().catch((): null => null)) as { usedChars?: number; monthlyCharLimit?: number } | null
  if (!data || typeof data.usedChars !== 'number') return null
  return { usedChars: data.usedChars, monthlyCharLimit: data.monthlyCharLimit ?? 0 }
}
