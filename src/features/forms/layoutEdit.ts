/**
 * Edits to a form's layout tree, for the form panel inside the page visual editor.
 *
 * Every function returns a new tree and never changes its input, so a panel can keep the last saved tree
 * for Cancel. The tree is the one `layout.ts` reads: top-level nodes, and nodes inside a section's columns.
 * Fields and steps are found wherever they sit; reordering and removal happen inside their own container,
 * so a field never jumps out of its column.
 */

import { FORM_ELEMENTS } from './elementDefs'
import { FIELD_ELEMENT_PREFIX, type LayoutColumn, type LayoutNode } from './layout'

/** A row the panel lists: a form element (field, step, HTML) with its props and how deep it sits in the tree. */
export type EditableRow = { id: string; elementType: string; depth: number; props: Record<string, unknown> }

const isFormElement = (node: LayoutNode): boolean => node.blockType === 'element' && typeof node.elementType === 'string' && node.elementType.startsWith(FIELD_ELEMENT_PREFIX)

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Works through the tree in reading order and returns the form elements only. */
export function listEditableRows(layout: unknown): EditableRow[] {
  const rows: EditableRow[] = []
  const walk = (nodes: LayoutNode[] | undefined, depth: number) => {
    for (const node of nodes ?? []) {
      if (!node || typeof node !== 'object') continue
      if (isFormElement(node)) {
        rows.push({ id: String(node._id ?? ''), elementType: node.elementType as string, depth, props: (node.props ?? {}) as Record<string, unknown> })
      }
      for (const column of (node.columns ?? []) as LayoutColumn[]) walk(column.blocks as LayoutNode[] | undefined, depth + 1)
    }
  }
  walk(Array.isArray(layout) ? (layout as LayoutNode[]) : [], 0)
  return rows
}

type Located = { container: LayoutNode[]; index: number }

/** Finds the array holding the node with this id, and its index there. */
function locate(nodes: LayoutNode[], id: string): Located | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (node && node._id === id) return { container: nodes, index }
    for (const column of (node?.columns ?? []) as LayoutColumn[]) {
      if (!column.blocks) continue
      const found = locate(column.blocks as LayoutNode[], id)
      if (found) return found
    }
  }
  return null
}

/** Moves a node one place up (-1) or down (+1) inside its own container. A move past the edge changes nothing. */
export function moveNode(layout: unknown, id: string, delta: -1 | 1): LayoutNode[] {
  const tree = clone(Array.isArray(layout) ? (layout as LayoutNode[]) : [])
  const found = locate(tree, id)
  if (!found) return tree
  const target = found.index + delta
  if (target < 0 || target >= found.container.length) return tree
  const [moved] = found.container.splice(found.index, 1)
  found.container.splice(target, 0, moved!)
  return tree
}

/** Removes a node (and whatever a section holds) from the tree. */
export function removeNode(layout: unknown, id: string): LayoutNode[] {
  const tree = clone(Array.isArray(layout) ? (layout as LayoutNode[]) : [])
  const found = locate(tree, id)
  if (found) found.container.splice(found.index, 1)
  return tree
}

/** Sets props on one form element. Keys with `undefined` are removed, so a cleared text box stops being stored. */
export function updateNodeProps(layout: unknown, id: string, patch: Record<string, unknown>): LayoutNode[] {
  const tree = clone(Array.isArray(layout) ? (layout as LayoutNode[]) : [])
  const found = locate(tree, id)
  if (!found) return tree
  const node = found.container[found.index]!
  const props: Record<string, unknown> = { ...((node.props ?? {}) as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete props[key]
    else props[key] = value
  }
  found.container[found.index] = { ...node, props }
  return tree
}

/** Makes an id for a new node. Same shape the page editor uses, so ids stay unique across both. */
export const newNodeId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** The palette the panel offers: every form element type, in the order the editor lists them. */
export function formElementChoices(): Array<{ elementType: string; label: string }> {
  return FORM_ELEMENTS.map((el) => ({ elementType: el.type, label: el.label }))
}

/** Appends a new form element at the end of the top-level layout, with the element's own default props. */
export function appendFormElement(layout: unknown, elementType: string, newId: string = newNodeId()): LayoutNode[] {
  const tree = clone(Array.isArray(layout) ? (layout as LayoutNode[]) : [])
  const def = FORM_ELEMENTS.find((el) => el.type === elementType)
  if (!def) return tree
  const props = def.defaultProps ? (def.defaultProps() as Record<string, unknown>) : {}
  tree.push({ blockType: 'element', _id: newId, elementType, props })
  return tree
}
