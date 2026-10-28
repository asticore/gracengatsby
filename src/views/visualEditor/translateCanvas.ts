/**
 * The pure half of the builder's translate mode.
 *
 * While a non-default language is being edited, the canvas shows the page in
 * that language. This module turns the document's loaded translations into
 * the three things the canvas and the panel need:
 *
 *   - the translated block tree (a display copy; the saved tree is untouched),
 *   - a mark per block (how its text stands in this language, its source text
 *     for the tooltip, and whether double-click may edit it on the canvas),
 *   - the field order and the rules for Alt+arrow navigation and for which
 *     status actions a field offers.
 *
 * Nothing here touches React, the request or the engine. Field paths are the
 * ones the Translations screen and the public overlay already use
 * (`blocks.<key>.<path>`), so a row edited on the canvas is the same row the
 * panel shows.
 */

import type { SectionNode } from '@/lib/sectionTree'
import { blockKeyFor, writeBlockField } from '@/features/multilingual/blockText'
import type { DocumentTranslations } from '@/features/multilingual/documentTranslations'
import { worstStatus, type TranslationStatus } from '@/features/multilingual/translationStatus'

import { pathKey, type NodePath } from './treeOps'

/** What the canvas can show for one text: a stored status, or no usable translation at all. */
export type CanvasTextStatus = 'untranslated' | TranslationStatus

/** One translatable text in the language being edited. */
export type CanvasTextCell = {
  fieldPath: string
  /** The block's key, read out of the field path. */
  blockKey: string
  label: string
  sourceText: string
  /** The stored translation ('' when none). */
  value: string
  status: CanvasTextStatus
  rowId: string | number | null
  canApprove: boolean
}

/** The mark the canvas draws on one block. */
export type CanvasBlockMark = {
  status: CanvasTextStatus
  /** The source text, shown as a tooltip. */
  source: string
  /** True when the block has translatable text, so double-click may edit it. */
  editable: boolean
}

/** The text cells of one language, keyed by field path, in the order the page lists them. */
export function textCellsFor(
  state: DocumentTranslations,
  locale: string,
  drafts: Readonly<Record<string, string>> = {},
): CanvasTextCell[] {
  const group = state.locales.find((entry) => entry.locale === locale)
  if (!group) return []
  const cells: CanvasTextCell[] = []
  for (const field of group.fields) {
    if (field.richText) continue
    const blockKey = field.fieldPath.split('.')[1] ?? ''
    const value = drafts[field.fieldPath] ?? field.value
    const untranslated = field.status === 'missing' || value.trim().length === 0
    cells.push({
      fieldPath: field.fieldPath,
      blockKey,
      label: field.label,
      sourceText: field.sourceText,
      value,
      status: untranslated ? 'untranslated' : field.status,
      rowId: field.rowId,
      canApprove: field.canApprove,
    })
  }
  return cells
}

/**
 * The block tree as it reads in the language: each translated text replaces the
 * source text; an untranslated text keeps the source (it is marked, not blanked).
 * Returns the same array when there is nothing to translate.
 */
export function translatedBlocks(blocks: SectionNode[], cells: readonly CanvasTextCell[], blocksField: string): SectionNode[] {
  let doc: unknown = { [blocksField]: blocks }
  for (const cell of cells) {
    if (cell.status === 'untranslated') continue
    doc = writeBlockField(doc, cell.fieldPath, cell.value)
  }
  const next = (doc as Record<string, unknown>)[blocksField]
  return Array.isArray(next) ? (next as SectionNode[]) : blocks
}

/** Editor path of every block, by block key, using the same keying as the stored field paths. */
export function blockPathsByKey(blocks: SectionNode[]): Map<string, NodePath> {
  const out = new Map<string, NodePath>()
  const walk = (list: SectionNode[], prefix: number[]) => {
    list.forEach((node, position) => {
      const path = [...prefix, position]
      out.set(blockKeyFor(node as unknown as Record<string, unknown>, path), path)
      if (node.blockType === 'section' && Array.isArray(node.columns)) {
        node.columns.forEach((column, columnIndex) => {
          if (Array.isArray(column?.blocks)) walk(column.blocks as SectionNode[], [...path, columnIndex])
        })
      }
    })
  }
  walk(blocks, [])
  return out
}

/** The mark for each block that has translatable text, keyed by the block's editor path key. */
export function blockMarks(blocks: SectionNode[], cells: readonly CanvasTextCell[]): Record<string, CanvasBlockMark> {
  const byKey = new Map<string, CanvasTextCell[]>()
  for (const cell of cells) {
    const list = byKey.get(cell.blockKey) ?? []
    list.push(cell)
    byKey.set(cell.blockKey, list)
  }
  const out: Record<string, CanvasBlockMark> = {}
  for (const [key, path] of blockPathsByKey(blocks)) {
    const own = byKey.get(key)
    if (!own || own.length === 0) continue
    const stored = own.map((cell) => (cell.status === 'untranslated' ? 'missing' : cell.status))
    const worst = worstStatus(stored)
    out[pathKey(path)] = {
      status: worst === 'missing' ? 'untranslated' : worst,
      source: own[0]?.sourceText ?? '',
      editable: true,
    }
  }
  return out
}

/**
 * The field a canvas element stands for, as a field path. An element block keeps
 * its text under `props`, so the heading's `text` prop is `blocks.<key>.props.text`.
 */
export function fieldPathForElementText(blocksField: string, blockKey: string, prop: string): string {
  return `${blocksField}.${blockKey}.props.${prop}`
}

/** The first translatable field of a block, which is what a click on that block focuses in the panel. */
export function firstFieldOfBlock(cells: readonly CanvasTextCell[], blockKey: string): string | null {
  return cells.find((cell) => cell.blockKey === blockKey)?.fieldPath ?? null
}

/**
 * The next (or previous) untranslated field in page order, wrapping at the ends.
 * `current` is the focused field path, or null to start from the top (or the bottom,
 * for a previous step). Returns null when nothing is untranslated.
 */
export function nextUntranslatedField(cells: readonly CanvasTextCell[], current: string | null, direction: 1 | -1): string | null {
  const open = cells.map((cell, index) => ({ index, cell })).filter(({ cell }) => cell.status === 'untranslated')
  if (open.length === 0) return null
  const currentIndex = current === null ? -1 : cells.findIndex((cell) => cell.fieldPath === current)
  if (direction === 1) {
    const after = open.find(({ index }) => index > currentIndex)
    return (after ?? open[0]).cell.fieldPath
  }
  const before = [...open].reverse().find(({ index }) => index < (currentIndex === -1 ? cells.length : currentIndex))
  return (before ?? open[open.length - 1]).cell.fieldPath
}

/** Structure (add, move, delete, duplicate, paste, undo of structure, drag and property edits) is read-only while translating. */
export function structureLockedInTranslate(translating: boolean): boolean {
  return translating
}

export type CellAction = 'approve' | 'requestReview' | 'copySource' | 'machineTranslate'

/**
 * Which status actions a text offers. The server still decides every write
 * (see evaluateTranslationWrite); this only hides buttons that would do nothing.
 */
export function cellActions(cell: Pick<CanvasTextCell, 'status' | 'value' | 'sourceText' | 'canApprove'>): CellAction[] {
  const actions: CellAction[] = []
  const hasValue = cell.value.trim().length > 0
  if (cell.canApprove && hasValue && cell.status !== 'approved') actions.push('approve')
  if (hasValue && cell.status !== 'needs_review') actions.push('requestReview')
  if (cell.status === 'untranslated' && cell.sourceText.trim().length > 0) actions.push('copySource')
  actions.push('machineTranslate')
  return actions
}

/** The status a text is left in by "Request review" on the server (it is the writable status for that action). */
export const REQUEST_REVIEW_STATUS: TranslationStatus = 'needs_review'

