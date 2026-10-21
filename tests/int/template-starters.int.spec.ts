// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SITE_TEMPLATE_KINDS } from '@/collections/SiteTemplates'
import { STARTERS } from '@/features/siteTemplates/starters'
import { ELEMENTS } from '@/lib/elements/registry'
import { parseColumns, type SectionNode } from '@/lib/sectionTree'

const registered = new Set(ELEMENTS.map((d) => d.type))

function elementsOf(nodes: SectionNode[]): SectionNode[] {
  const out: SectionNode[] = []
  for (const n of nodes) {
    if (n.blockType === 'element') out.push(n)
    for (const c of n.columns ?? []) out.push(...elementsOf((c.blocks ?? []) as SectionNode[]))
  }
  return out
}

describe('site template starters', () => {
  it('has unique ids, valid kinds, and covers every kind but none empty', () => {
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length)
    for (const s of STARTERS) expect(SITE_TEMPLATE_KINDS).toContain(s.kind)
    for (const k of SITE_TEMPLATE_KINDS) expect(STARTERS.some((s) => s.kind === k), k).toBe(true)
  })

  it('every starter survives the section-tree sanitiser unchanged in shape and uses only registered, visible elements', () => {
    for (const s of STARTERS) {
      const blocks = s.blocks()
      expect(blocks.length, s.id).toBeGreaterThan(0)
      for (const b of blocks) {
        expect(b.blockType, s.id).toBe('section')
        const parsed = parseColumns(b.columns)
        expect(parsed.length, s.id).toBe((b.columns ?? []).length)
        parsed.forEach((c, i) => expect(c.blocks?.length, s.id).toBe(b.columns?.[i].blocks?.length))
      }
      const els = elementsOf(blocks)
      expect(els.length, s.id).toBeGreaterThan(0)
      for (const e of els) {
        expect(registered.has(String(e.elementType)), `${s.id}: ${e.elementType}`).toBe(true)
        expect(ELEMENTS.find((d) => d.type === e.elementType)?.hidden ?? false, `${s.id}: ${e.elementType} hidden`).toBe(false)
      }
    }
  })

  it('single-* starters include the content slot', () => {
    for (const s of STARTERS.filter((x) => x.kind.startsWith('single-'))) {
      expect(elementsOf(s.blocks()).some((e) => e.elementType === 'content-slot'), s.id).toBe(true)
    }
  })
})
