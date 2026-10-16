import type { NodePath } from './treeOps'

/** Where a library card dropped at a point would insert, plus the key the canvas highlights. */
export type DropSlot = { containerPath: NodePath; at: number; key: string }

/** Native drag MIME types set by ElementLibrary.tsx / TemplateBrowser.tsx. */
export const VE_BLOCK_MIME = 'application/x-ve-block'
export const VE_TEMPLATE_MIME = 'application/x-ve-template'

/** True when a drag's `types` list (the only thing readable during dragover) is a library card. */
export const isLibraryDragTypes = (types: ArrayLike<string> | null | undefined): boolean => {
  if (!types) return false
  const list = Array.from(types as ArrayLike<string>)
  return list.includes(VE_BLOCK_MIME) || list.includes(VE_TEMPLATE_MIME)
}

/**
 * Parent-viewport pointer -> iframe-document viewport coordinates (what the frame's
 * elementFromPoint expects). Null when the pointer is outside the frame.
 */
export const clientToFrame = (
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null => {
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  return { x, y }
}

const parsePath = (raw: string | undefined): NodePath | null => {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    return Array.isArray(value) && value.every((n) => Number.isInteger(n)) ? (value as NodePath) : null
  } catch {
    return null
  }
}

const make = (containerPath: NodePath, at: number): DropSlot => ({ containerPath, at, key: `${containerPath.join('.')}|${at}` })

const slotOf = (slot: HTMLElement): DropSlot | null => {
  const containerPath = parsePath(slot.dataset.veContainer)
  const at = Number(slot.dataset.veAt || '0')
  return containerPath && Number.isFinite(at) ? make(containerPath, at) : null
}

const samePath = (a: NodePath, b: NodePath) => a.length === b.length && a.every((v, i) => b[i] === v)

/**
 * Resolves the insert slot for the element under the pointer: an insert slot itself, a block body
 * (the slot just before / after it by which half `y` is in), a column (end of its list) or the
 * bare page (end of the page). `y` is in the same viewport space as getBoundingClientRect().
 */
export function resolveSlotFromElement(el: Element | null, y: number): DropSlot | null {
  if (!el) return null
  const hit = el.closest('[data-ve-slot],[data-ve-node],[data-ve-column],[data-ve-root]') as HTMLElement | null
  if (!hit) return null

  if (hit.dataset.veSlot) return slotOf(hit)

  if (hit.dataset.veNode) {
    const path = parsePath(hit.dataset.veNode)
    if (!path || path.length === 0) return null
    const box = hit.getBoundingClientRect()
    const after = y > box.top + box.height / 2
    return make(path.slice(0, -1), path[path.length - 1] + (after ? 1 : 0))
  }

  const target = hit.dataset.veColumn ? parsePath(hit.dataset.veColumn) : []
  if (!target) return null
  const slots = Array.from(hit.querySelectorAll<HTMLElement>('[data-ve-slot]'))
    .map(slotOf)
    .filter((s): s is DropSlot => Boolean(s) && samePath(s!.containerPath, target))
  if (slots.length === 0) return null
  return slots.reduce((best, s) => (s.at > best.at ? s : best))
}

/** Convenience wrapper over the frame document. */
export function resolveDropSlotInDoc(doc: Document, x: number, y: number): DropSlot | null {
  return resolveSlotFromElement(doc.elementFromPoint(x, y), y)
}
