import { parseColumns, type SectionNode } from '@/lib/sectionTree'

/**
 * Pure helpers over a template's block tree (no React, no server imports), shared by the header and footer,
 * the sidebars and the Template part element.
 */

export const isContentSlotNode = (node: SectionNode): boolean => node.blockType === 'element' && node.elementType === 'content-slot'

/** A "Template part" element: a whole site template placed inside another template or a page. */
export const isTemplatePartNode = (node: SectionNode): boolean => node.blockType === 'element' && node.elementType === 'template-part'

/** Removes every node the predicate matches, at the top level and inside sections (any depth). */
export function dropNodes(blocks: unknown[], drop: (node: SectionNode) => boolean): unknown[] {
  const out: unknown[] = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const node = raw as SectionNode
    if (drop(node)) continue
    if (node.blockType === 'section') {
      out.push({ ...node, columns: dropInColumns(parseColumns(node.columns), drop) })
    } else out.push(node)
  }
  return out
}

const dropInColumns = (columns: ReturnType<typeof parseColumns>, drop: (node: SectionNode) => boolean): ReturnType<typeof parseColumns> =>
  columns.map((column) => ({
    ...column,
    blocks: (column.blocks || [])
      .filter((n) => !drop(n))
      .map((n) => (n.blockType === 'section' ? { ...n, columns: dropInColumns(parseColumns(n.columns), drop) } : n)),
  }))

/**
 * Header, footer and sidebars are drawn outside the page's render, so there is no page content to place: any
 * "Template content" element is removed.
 */
export const stripContentSlots = (blocks: unknown[]): unknown[] => dropNodes(blocks, isContentSlotNode)

/**
 * A template part is drawn inside another template or page. It cannot hold another part (that could loop), and
 * it has no page content to place, so both are removed from the part's blocks.
 */
export const stripPartNesting = (blocks: unknown[]): unknown[] => dropNodes(blocks, (n) => isContentSlotNode(n) || isTemplatePartNode(n))

/** Every template id a block tree places with a "Template part" element, in order, duplicates kept. */
export function templatePartIdsIn(blocks: unknown[]): string[] {
  const ids: string[] = []
  dropNodes(blocks, (node) => {
    if (isTemplatePartNode(node)) {
      const id = templatePartIdOf(node)
      if (id !== null) ids.push(id)
    }
    return false
  })
  return ids
}

/** The template id stored on a Template part element, as a string, or null when it is not a usable id. */
export function templatePartIdOf(node: SectionNode): string | null {
  const props = (node as unknown as { props?: unknown }).props
  return parseTemplatePartId(props && typeof props === 'object' ? (props as Record<string, unknown>).templateId : undefined)
}

/** A positive whole number (or its string form) is an id; anything else is not. */
export function parseTemplatePartId(value: unknown): string | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? String(n) : null
}

/**
 * Element types that were renamed. A template saved before the rename still names the old type, so it is
 * upgraded when the template is prepared for rendering. `breadcrumbs` (a typed trail) becomes the Auto breadcrumbs
 * element, which builds the trail from the page address; its old `items` and `separator` props are dropped.
 */
export const LEGACY_ELEMENT_TYPES: Record<string, string> = { breadcrumbs: 'auto-breadcrumbs' }

/** Returns the blocks with every renamed element type upgraded, at the top level and inside sections (any depth). */
export function upgradeLegacyElements(blocks: unknown[]): unknown[] {
  const upgradeColumns = (columns: ReturnType<typeof parseColumns>): ReturnType<typeof parseColumns> =>
    columns.map((column) => ({ ...column, blocks: (column.blocks || []).map(upgradeNode) as typeof column.blocks }))
  const upgradeNode = (node: SectionNode): SectionNode => {
    if (node.blockType === 'section') return { ...node, columns: upgradeColumns(parseColumns(node.columns)) } as SectionNode
    if (node.blockType === 'element' && typeof node.elementType === 'string' && LEGACY_ELEMENT_TYPES[node.elementType]) {
      return { ...node, elementType: LEGACY_ELEMENT_TYPES[node.elementType], props: {} } as SectionNode
    }
    return node
  }
  return blocks.map((raw) => (raw && typeof raw === 'object' ? upgradeNode(raw as SectionNode) : raw))
}
