import type { BlockStyle } from '@/lib/blockStyle'
import { upgradeV1 } from './upgradeV1'

/**
 * Upgrade-on-write for the visual editor's style panel.
 *
 * The panel edits a flat v1 BlockStyle. Before it is stored, the value is written in the unified
 * grouped model (upgradeV1: every key under `groups[group]`). The read path (asBlockStyle /
 * readFlatDesign) downgrades it back to the same flat object, so the round trip is exact and
 * nothing renders differently.
 *
 * A style with no grouped keys (empty, or only unknown keys) is stored flat, because the
 * grouped reader would otherwise read it as empty.
 */
export function toStoredDesign(style: BlockStyle): Record<string, unknown> {
  const flat = style as unknown as Record<string, unknown>
  const upgraded = upgradeV1(flat)
  return upgraded.groups ? (upgraded as unknown as Record<string, unknown>) : flat
}
