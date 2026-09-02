/**
 * Immutable operations over the visual editor's nested block tree.
 *
 * A path addresses any node at any depth:
 *   [2]           -> top-level block 2
 *   [2, 0, 1]     -> block 2 -> column 0 -> child block 1
 *   [2, 0, 1, 3]  -> ...that child's column 3   (even length = a column)
 *
 * Odd-length paths point at a block, even-length paths at a column. Keeping the
 * addressing this uniform is what lets one set of handlers (select, move,
 * delete, duplicate, insert) work at every nesting level instead of needing a
 * special case per depth.
 */

import type { SectionColumn, SectionNode } from '@/lib/sectionTree'

export type NodePath = number[]

export const pathKey = (path: NodePath): string => path.join('.')

export const isColumnPath = (path: NodePath): boolean => path.length > 0 && path.length % 2 === 0

/** Reads the node at a block path, or undefined if the path no longer resolves. */
export function getNode(blocks: SectionNode[], path: NodePath): SectionNode | undefined {
  if (path.length === 0 || path.length % 2 === 0) return undefined

  let node: SectionNode | undefined = blocks[path[0]]
  for (let i = 1; i < path.length && node; i += 2) {
    const column = node.columns?.[path[i]]
    node = column?.blocks?.[path[i + 1]]
  }
  return node
}

/** Reads the column at an even-length path. */
export function getColumn(blocks: SectionNode[], path: NodePath): SectionColumn | undefined {
  if (!isColumnPath(path)) return undefined
  const owner = getNode(blocks, path.slice(0, -1))
  return owner?.columns?.[path[path.length - 1]]
}

/**
 * Returns a new tree with the block at `path` replaced by `updater`'s result.
 * Returning `null` from the updater deletes the node.
 */
export function updateNode(
  blocks: SectionNode[],
  path: NodePath,
  updater: (node: SectionNode) => SectionNode | null,
): SectionNode[] {
  if (path.length === 0) return blocks

  const [index, ...rest] = path
  const target = blocks[index]
  if (!target) return blocks

  if (rest.length === 0) {
    const next = updater(target)
    if (next === null) return blocks.filter((_, i) => i !== index)
    return blocks.map((block, i) => (i === index ? next : block))
  }

  const [columnIndex, ...deeper] = rest
  const columns = target.columns || []
  const column = columns[columnIndex]
  if (!column) return blocks

  const updatedColumn: SectionColumn = {
    ...column,
    blocks: updateNode(column.blocks || [], deeper, updater),
  }

  return blocks.map((block, i) =>
    i === index
      ? { ...block, columns: columns.map((c, ci) => (ci === columnIndex ? updatedColumn : c)) }
      : block,
  )
}

/** Returns a new tree with `column` at an even-length path replaced. */
export function updateColumn(
  blocks: SectionNode[],
  path: NodePath,
  updater: (column: SectionColumn) => SectionColumn,
): SectionNode[] {
  if (!isColumnPath(path)) return blocks
  const ownerPath = path.slice(0, -1)
  const columnIndex = path[path.length - 1]

  return updateNode(blocks, ownerPath, (node) => {
    const columns = node.columns || []
    if (!columns[columnIndex]) return node
    return { ...node, columns: columns.map((c, i) => (i === columnIndex ? updater(c) : c)) }
  })
}

/** Inserts `node` into the list containing `path`, at position `at`. */
export function insertNode(
  blocks: SectionNode[],
  containerPath: NodePath,
  at: number,
  node: SectionNode,
): SectionNode[] {
  // Empty container path = the top-level block list.
  if (containerPath.length === 0) {
    const next = [...blocks]
    next.splice(Math.min(at, next.length), 0, node)
    return next
  }

  return updateColumn(blocks, containerPath, (column) => {
    const list = [...(column.blocks || [])]
    list.splice(Math.min(at, list.length), 0, node)
    return { ...column, blocks: list }
  })
}

/** Moves a block within its own list. Cross-container drags are not supported. */
export function reorderWithin(
  blocks: SectionNode[],
  containerPath: NodePath,
  from: number,
  to: number,
): SectionNode[] {
  const move = (list: SectionNode[]): SectionNode[] => {
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }

  if (containerPath.length === 0) return move(blocks)
  return updateColumn(blocks, containerPath, (column) => ({ ...column, blocks: move(column.blocks || []) }))
}

/** Path of the list a block lives in, and its index within that list. */
export function splitPath(path: NodePath): { containerPath: NodePath; index: number } {
  return { containerPath: path.slice(0, -1), index: path[path.length - 1] }
}

/** Deep-clones a node, giving it and every descendant fresh ids. */
export function cloneNode(node: SectionNode, makeId: () => string): SectionNode {
  const clone: SectionNode = { ...node, _id: makeId() }
  if (Array.isArray(node.columns)) {
    clone.columns = node.columns.map((column) => ({
      ...column,
      _id: makeId(),
      blocks: (column.blocks || []).map((child) => cloneNode(child, makeId)),
    }))
  }
  return clone
}

/** Strips editor-only ids before the tree is written back to the CMS. */
export function stripEditorIds(nodes: SectionNode[]): SectionNode[] {
  return nodes.map((node) => {
    const { _id: _ignored, ...rest } = node as SectionNode & { _id?: string }
    const cleaned: SectionNode = { ...rest }
    if (Array.isArray(node.columns)) {
      cleaned.columns = node.columns.map((column) => {
        const { _id: _ignoredColumnId, ...restColumn } = column as SectionColumn & { _id?: string }
        return {
          ...restColumn,
          blocks: stripEditorIds(column.blocks || []),
        }
      })
    }
    return cleaned
  })
}