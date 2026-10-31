import { readFlatDesign } from '@/lib/design/upgrade'
/** Pure helpers for the Navigator: hide-everywhere flag and drag/keyboard move planning. */
import type { NodePath } from './treeOps'

type Design = Record<string, unknown>
const obj = (v: unknown): Design => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Design) : {})

/** True when the block is hidden on desktop, tablet and mobile (the per-device hide flags). */
export function isHiddenEverywhere(design: unknown): boolean {
  const d = readFlatDesign(design)
  return Boolean(d.hideOnDesktop) && Boolean(obj(d.tablet).hide) && (Boolean(obj(d.mobile).hide) || Boolean(d.hideOnMobile))
}

/** Design with the block hidden on every device, or (when already hidden) with all hide flags cleared. */
export function toggleHideEverywhere(design: unknown): Design {
  const d: Design = { ...readFlatDesign(design) }
  const tablet: Design = { ...obj(d.tablet) }
  const mobile: Design = { ...obj(d.mobile) }
  if (isHiddenEverywhere(d)) {
    delete d.hideOnDesktop
    delete d.hideOnMobile
    delete tablet.hide
    delete mobile.hide
  } else {
    d.hideOnDesktop = true
    delete d.hideOnMobile
    tablet.hide = true
    mobile.hide = true
  }
  if (Object.keys(tablet).length) d.tablet = tablet
  else delete d.tablet
  if (Object.keys(mobile).length) d.mobile = mobile
  else delete d.mobile
  return d
}

export type DropZone = 'before' | 'after' | 'inside'
export type DropPlan = { containerPath: NodePath; at: number }

/**
 * Where a drop on a row lands. Block/section rows take before/after (their own list);
 * column rows take 'inside' (end of that column, `columnLength` = its current block count).
 * Returns null when the zone does not fit the row.
 */
export function planNavDrop(rowPath: NodePath, isColumn: boolean, zone: DropZone, columnLength = 0): DropPlan | null {
  if (rowPath.length === 0) return null
  if (isColumn) return zone === 'inside' ? { containerPath: rowPath, at: columnLength } : null
  if (zone === 'inside') return null
  const containerPath = rowPath.slice(0, -1)
  const idx = rowPath[rowPath.length - 1]
  return { containerPath, at: zone === 'before' ? idx : idx + 1 }
}

/** Alt+Up/Down: slot (numbered before the move) one position up or down in the same list. */
export function planKeyMove(path: NodePath, direction: -1 | 1, listLength: number): DropPlan | null {
  if (path.length === 0 || path.length % 2 === 0) return null
  const idx = path[path.length - 1]
  const target = idx + direction
  if (target < 0 || target >= listLength) return null
  return { containerPath: path.slice(0, -1), at: direction < 0 ? idx - 1 : idx + 2 }
}

/** Zone from the pointer's vertical position in the row (top 40% before, bottom 40% after, middle inside for columns). */
export function zoneFromOffset(offsetY: number, height: number, isColumn: boolean): DropZone {
  const r = height > 0 ? offsetY / height : 0.5
  if (isColumn) return 'inside'
  return r < 0.5 ? 'before' : 'after'
}
