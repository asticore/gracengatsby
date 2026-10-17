/**
 * Column-level operations for the visual editor: reading and updating one column of a section,
 * add / duplicate / delete / move left-right, and the "Select your structure" presets.
 *
 * Pure functions over the same tree and paths as treeOps.ts (an even-length path addresses a
 * column), kept in their own file so they do not touch the block-level helpers.
 */

import type { SectionColumn, SectionNode } from '@/lib/sectionTree'

import type { ColumnOp } from './canvasBridge'
import { cloneNode, getNode, updateNode, type NodePath } from './treeOps'

export const isColumnPath = (path: NodePath | null | undefined): path is NodePath =>
  Array.isArray(path) && path.length > 0 && path.length % 2 === 0

/** The column at an even-length path, or undefined when it no longer resolves. */
export function getColumn(blocks: SectionNode[], path: NodePath): SectionColumn | undefined {
  if (!isColumnPath(path)) return undefined
  return getNode(blocks, path.slice(0, -1))?.columns?.[path[path.length - 1]]
}

/** The section that owns the column at `path`. */
export function getColumnOwner(blocks: SectionNode[], path: NodePath): SectionNode | undefined {
  return isColumnPath(path) ? getNode(blocks, path.slice(0, -1)) : undefined
}

/** A new tree with one column replaced by `updater`'s result. */
export function updateColumnAt(blocks: SectionNode[], path: NodePath, updater: (column: SectionColumn) => SectionColumn): SectionNode[] {
  if (!isColumnPath(path)) return blocks
  const index = path[path.length - 1]
  return updateNode(blocks, path.slice(0, -1), (node) => {
    const columns = node.columns || []
    if (!columns[index]) return node
    return { ...node, columns: columns.map((c, i) => (i === index ? updater(c) : c)) }
  })
}

/** Replaces the owner section's whole column list. */
function updateColumns(blocks: SectionNode[], ownerPath: NodePath, updater: (columns: SectionColumn[]) => SectionColumn[]): SectionNode[] {
  return updateNode(blocks, ownerPath, (node) => ({ ...node, columns: updater(node.columns || []) }))
}

export type ColumnOpResult = { blocks: SectionNode[]; selectedPath: NodePath | null }

/**
 * Applies add / duplicate / delete / moveLeft / moveRight. Returns null when the operation does
 * nothing (a bad path, the first column moved left, the only column deleted).
 * 'innerSection' is not a tree edit on its own (it opens the structure picker) so it returns null here.
 */
export function applyColumnOp(blocks: SectionNode[], path: NodePath, op: ColumnOp, makeId: () => string): ColumnOpResult | null {
  const column = getColumn(blocks, path)
  if (!column) return null
  const ownerPath = path.slice(0, -1)
  const index = path[path.length - 1]
  const count = getColumnOwner(blocks, path)?.columns?.length ?? 0
  const at = (i: number): NodePath => [...ownerPath, i]

  switch (op) {
    case 'add': {
      const fresh: SectionColumn = { _id: makeId(), widthDesktop: { value: 6, unit: 'fraction' }, design: {}, blocks: [] }
      return {
        blocks: updateColumns(blocks, ownerPath, (cols) => [...cols.slice(0, index + 1), fresh, ...cols.slice(index + 1)]),
        selectedPath: at(index + 1),
      }
    }
    case 'duplicate': {
      const copy: SectionColumn = {
        ...column,
        _id: makeId(),
        blocks: (column.blocks || []).map((child) => cloneNode(child, makeId)),
      }
      return {
        blocks: updateColumns(blocks, ownerPath, (cols) => [...cols.slice(0, index + 1), copy, ...cols.slice(index + 1)]),
        selectedPath: at(index + 1),
      }
    }
    case 'delete': {
      if (count <= 1) return null
      return {
        blocks: updateColumns(blocks, ownerPath, (cols) => cols.filter((_, i) => i !== index)),
        selectedPath: at(Math.min(index, count - 2)),
      }
    }
    case 'moveLeft':
    case 'moveRight': {
      const to = op === 'moveLeft' ? index - 1 : index + 1
      if (to < 0 || to >= count) return null
      return {
        blocks: updateColumns(blocks, ownerPath, (cols) => {
          const next = [...cols]
          const [moved] = next.splice(index, 1)
          next.splice(to, 0, moved)
          return next
        }),
        selectedPath: at(to),
      }
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------------------- */
/* "Select your structure"                                                     */
/* ------------------------------------------------------------------------- */

/** A starting layout: the desktop width of each column as a span of the 12-column grid. Spans past 12 wrap to a new row. */
export type Structure = { id: string; label: string; widths: number[] }

export const STRUCTURES: Structure[] = [
  { id: 'one', label: '1 column', widths: [12] },
  { id: 'two', label: '2 columns, 50 / 50', widths: [6, 6] },
  { id: 'third-twothirds', label: '2 columns, 33 / 66', widths: [4, 8] },
  { id: 'twothirds-third', label: '2 columns, 66 / 33', widths: [8, 4] },
  { id: 'quarter-threequarters', label: '2 columns, 25 / 75', widths: [3, 9] },
  { id: 'threequarters-quarter', label: '2 columns, 75 / 25', widths: [9, 3] },
  { id: 'three', label: '3 columns', widths: [4, 4, 4] },
  { id: 'four', label: '4 columns', widths: [3, 3, 3, 3] },
  { id: 'quarter-half-quarter', label: '3 columns, 25 / 50 / 25', widths: [3, 6, 3] },
  { id: 'rows', label: '2 rows, stacked', widths: [12, 12] },
]

/** Fresh empty columns for a structure. */
export function columnsForStructure(widths: number[], makeId: () => string): SectionColumn[] {
  return widths.map((value): SectionColumn => ({ _id: makeId(), widthDesktop: { value, unit: 'fraction' }, design: {}, blocks: [] }))
}

/** A new empty section laid out as `widths`. Used for both top-level sections and inner sections. */
export function buildSectionNode(widths: number[], makeId: () => string): SectionNode {
  return { blockType: 'section', _id: makeId(), columns: columnsForStructure(widths, makeId) }
}

/** Rectangles (in a w x h box) for drawing a structure icon: columns left to right, wrapping at 12. */
export function structureRects(widths: number[], w = 60, h = 36, gap = 2): { x: number; y: number; w: number; h: number }[] {
  const rows: number[][] = [[]]
  let used = 0
  for (const span of widths) {
    if (used + span > 12 && rows[rows.length - 1].length > 0) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1].push(span)
    used += span
  }
  const rowH = (h - gap * (rows.length - 1)) / rows.length
  const out: { x: number; y: number; w: number; h: number }[] = []
  rows.forEach((row, r) => {
    const total = row.reduce((a, b) => a + b, 0)
    const usable = w - gap * (row.length - 1)
    let x = 0
    for (const span of row) {
      const cw = (usable * span) / total
      out.push({ x, y: r * (rowH + gap), w: cw, h: rowH })
      x += cw + gap
    }
  })
  return out
}

/* ------------------------------------------------------------------------- */
/* Drag-resize of adjacent columns (the canvas handle between two columns)    */
/* ------------------------------------------------------------------------- */

/** The breakpoint whose width is being edited: the top bar's device toggle. */
export type ColumnDevice = 'desktop' | 'tablet' | 'mobile'

const WIDTH_FIELD = { desktop: 'widthDesktop', tablet: 'widthTablet', mobile: 'widthMobile' } as const

const roundTo2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Moves the boundary between column `index` and `index + 1` by `deltaPct` (percent of the row).
 * Only that pair changes, and their sum is kept. The first column snaps to whole percents and
 * both stay within [min, max]; the other columns come back as they went in. Returns a copy.
 */
export function resizeAdjacent(widths: number[], index: number, deltaPct: number, min = 10, max = 90): number[] {
  const out = [...widths]
  if (!Number.isInteger(index) || index < 0 || index + 1 >= widths.length || !Number.isFinite(deltaPct)) return out
  const pair = widths[index] + widths[index + 1]
  const lo = Math.max(min, pair - max)
  const hi = Math.min(max, pair - min)
  if (!(lo <= hi)) return out
  const first = Math.min(hi, Math.max(lo, Math.round(widths[index] + deltaPct)))
  out[index] = roundTo2(first)
  out[index + 1] = roundTo2(pair - first)
  return out
}

/**
 * The width of a column on one device, as a percent of its section, following the same cascade
 * the generated CSS uses (tablet falls back to desktop, mobile to tablet). Null when the width is
 * px / auto / fill, which the drag handle does not resize.
 */
export function columnPercentFor(column: SectionColumn, device: ColumnDevice): number | null {
  const order: ColumnDevice[] = ['desktop', 'tablet', 'mobile']
  const desktop = column.widthDesktop ?? { value: column.width ?? 12, unit: 'fraction' as const }
  const upTo = order.slice(0, order.indexOf(device) + 1).reverse()
  let width: { value: number; unit: string } | undefined
  for (const d of upTo) {
    width = d === 'desktop' ? desktop : column[WIDTH_FIELD[d]]
    if (width) break
  }
  if (!width) return null
  if (width.unit === 'fraction') return (width.value / 12) * 100
  if (width.unit === 'percent') return width.value
  return null
}

/**
 * A new tree where the section at `sectionPath` takes `widths` (percent, one per column, for
 * `device`). Only columns whose width actually changes are written, as a percent width on that
 * device - the same write ColumnPanel makes for a custom width. One call is one undo step.
 */
export function applyColumnWidths(blocks: SectionNode[], sectionPath: NodePath, widths: number[], device: ColumnDevice): SectionNode[] {
  const section = getNode(blocks, sectionPath)
  const columns = section?.columns || []
  if (!section || widths.length !== columns.length) return blocks
  let changed = false
  const next = columns.map((column, j): SectionColumn => {
    const target = widths[j]
    if (!Number.isFinite(target) || target < 0 || target > 100) return column
    const current = columnPercentFor(column, device)
    if (current !== null && Math.abs(current - target) < 1e-9) return column
    changed = true
    return { ...column, [WIDTH_FIELD[device]]: { value: target, unit: 'percent' } }
  })
  // Same tree back when nothing moved, so the caller can skip the undo step.
  if (!changed) return blocks
  return updateNode(blocks, sectionPath, (node) => ({ ...node, columns: next }))
}
