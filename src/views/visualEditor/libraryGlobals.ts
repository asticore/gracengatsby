import type { SectionNode } from '@/lib/sectionTree'

export type GlobalCard = { id: number; name: string; description: string }

/** Turns a `reusable-sections` listing into library cards; rows without a usable id or name are skipped. */
export function globalCards(docs: unknown): GlobalCard[] {
  if (!Array.isArray(docs)) return []
  const out: GlobalCard[] = []
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue
    const { id, name, description } = doc as { id?: unknown; name?: unknown; description?: unknown }
    const numeric = typeof id === 'number' ? id : typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : NaN
    if (!Number.isInteger(numeric) || numeric <= 0) continue
    if (typeof name !== 'string' || name.trim() === '') continue
    out.push({ id: numeric, name: name.trim(), description: typeof description === 'string' ? description : '' })
  }
  return out
}

/** The reference block a Global card inserts: a `reusableSection` block pointing at the document. */
export function globalNode(id: number): SectionNode {
  return { blockType: 'reusableSection', section: id }
}
