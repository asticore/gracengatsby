/**
 * The Section block's column tree.
 *
 * A section holds columns; each column holds a stack of nodes; a node is either
 * a content block (hero, rich text, ...) or another section. Because the whole
 * tree lives in one JSON column, nesting is unbounded - a section inside a
 * column inside a section works with no extra schema.
 *
 * Everything here is defensive: the tree comes out of a JSON column that a user
 * could in principle have hand-edited, so every accessor tolerates junk and
 * falls back to something renderable rather than throwing mid-render.
 */

import { asBlockStyle, type BlockStyle } from './blockStyle'

/** Column widths as a 12-based grid span, matching common builder conventions. */
export type ColumnWidth = 12 | 8 | 6 | 4 | 3 | 9

export const COLUMN_WIDTH_OPTIONS: { label: string; value: ColumnWidth }[] = [
  { label: 'Full (100%)', value: 12 },
  { label: 'Three quarters (75%)', value: 9 },
  { label: 'Two thirds (66%)', value: 8 },
  { label: 'Half (50%)', value: 6 },
  { label: 'One third (33%)', value: 4 },
  { label: 'One quarter (25%)', value: 3 },
]

/** A block sitting inside a column. `blockType: 'section'` nests another section. */
export type SectionNode = {
  blockType: string
  /** Stable client-side id, used as a React key and for selection in the editor. */
  _id?: string
  design?: BlockStyle
  /** Only present when blockType === 'section'. */
  columns?: SectionColumn[]
  [key: string]: unknown
}

export type SectionColumn = {
  _id?: string
  width?: ColumnWidth
  design?: BlockStyle
  blocks?: SectionNode[]
}

/** Reads a section block's `columns` JSON column into a usable tree. */
export function parseColumns(value: unknown): SectionColumn[] {
  if (!Array.isArray(value)) return []
  return value.filter((c): c is SectionColumn => Boolean(c) && typeof c === 'object' && !Array.isArray(c)).map(normalizeColumn)
}

function normalizeColumn(column: SectionColumn): SectionColumn {
  return {
    _id: typeof column._id === 'string' ? column._id : undefined,
    width: isColumnWidth(column.width) ? column.width : 12,
    design: asBlockStyle(column.design),
    blocks: Array.isArray(column.blocks)
      ? column.blocks
          .filter((b): b is SectionNode => Boolean(b) && typeof b === 'object' && typeof (b as SectionNode).blockType === 'string')
          .map(normalizeNode)
      : [],
  }
}

function normalizeNode(node: SectionNode): SectionNode {
  const normalized: SectionNode = { ...node, design: asBlockStyle(node.design) }
  if (node.blockType === 'section') {
    normalized.columns = parseColumns(node.columns)
  }
  return normalized
}

function isColumnWidth(value: unknown): value is ColumnWidth {
  return value === 12 || value === 9 || value === 8 || value === 6 || value === 4 || value === 3
}

/** Default two-column split used when a fresh section is dropped on the canvas. */
export function defaultColumns(count: number, makeId: () => string): SectionColumn[] {
  const width = ([12, 6, 4, 3, 3, 3][Math.min(count, 5)] ?? 3) as ColumnWidth
  return Array.from(
    { length: Math.max(1, count) },
    (): SectionColumn => ({
      _id: makeId(),
      width: count === 1 ? 12 : width,
      design: {},
      blocks: [],
    }),
  )
}

/**
 * Walks every node in a column tree depth-first. Used to resolve media ids and
 * merge tags across a whole section without each caller re-implementing the walk.
 */
export function walkNodes(columns: SectionColumn[], visit: (node: SectionNode) => void): void {
  for (const column of columns) {
    for (const node of column.blocks || []) {
      visit(node)
      if (node.blockType === 'section' && Array.isArray(node.columns)) {
        walkNodes(node.columns, visit)
      }
    }
  }
}

/** Maps every node in a tree through `transform`, returning a new tree. */
export function mapNodes(columns: SectionColumn[], transform: (node: SectionNode) => SectionNode): SectionColumn[] {
  return columns.map((column) => ({
    ...column,
    blocks: (column.blocks || []).map((node) => {
      const next = transform(node)
      if (next.blockType === 'section' && Array.isArray(next.columns)) {
        return { ...next, columns: mapNodes(next.columns, transform) }
      }
      return next
    }),
  }))
}
