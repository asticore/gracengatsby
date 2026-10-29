// @vitest-environment node
// Ticket tier names and descriptions on events: stable ids, the sub-fields they
// produce, the overlay, and that a reorder keeps the translation attached to its tier.
import { describe, expect, it } from 'vitest'

import { overlayDocument } from '@/features/multilingual/overlay'
import { fieldsForDocument } from '@/features/multilingual/translatableFields'
import { sourceTextOf, valueAtPath } from '@/features/multilingual/store'
import { classifyTranslation, type LiveDocument } from '@/features/multilingual/documentRows'
import { parseTiers, withTierIds } from '@/features/editScreens/tiers'

let n = 0
const makeId = () => `t${++n}`

const event = (tiers: unknown[]) => ({
  id: 5,
  title: 'Gala',
  summary: '',
  description: null as string | null,
  location: { venueName: '', address: '' },
  ticketTiers: tiers,
})

describe('withTierIds', () => {
  it('keeps existing ids and assigns new ones only to tiers without one', () => {
    const out = withTierIds([{ name: 'VIP', id: 'keep1' }, { name: 'Standard' }], makeId) as Array<{ id: string }>
    expect(out[0].id).toBe('keep1')
    expect(out[1].id).toMatch(/^t\d+$/)
  })

  it('leaves a non-array value alone', () => {
    expect(withTierIds(null, makeId)).toBeNull()
  })
})

describe('parseTiers keeps the id', () => {
  it('returns the id when it is well formed and drops it when not', () => {
    const [good, bad] = parseTiers([{ name: 'A', id: 'abc-1' }, { name: 'B', id: 'has spaces' }])
    expect(good.id).toBe('abc-1')
    expect(bad.id).toBeUndefined()
  })
})

describe('tier sub-fields', () => {
  it('lists the name, and the description when present, for each tier with an id', () => {
    const doc = event([
      { id: 'a1', name: 'Standard', description: 'Entry', price: 10 },
      { id: 'b2', name: 'VIP', description: '', price: 50 },
      { name: 'Unsaved', price: 0 },
    ])
    const paths = fieldsForDocument('events', doc).map((f) => f.path)
    expect(paths).toContain('ticketTiers.a1.name')
    expect(paths).toContain('ticketTiers.a1.description')
    expect(paths).toContain('ticketTiers.b2.name')
    expect(paths).not.toContain('ticketTiers.b2.description')
    expect(paths.some((p) => p.includes('Unsaved'))).toBe(false)
  })

  it('reads the tier text through the same path the overlay writes', () => {
    const doc = event([{ id: 'a1', name: 'Standard', price: 10 }])
    expect(valueAtPath(doc, 'ticketTiers.a1.name')).toBe('Standard')
  })
})

describe('overlay and reorder', () => {
  it('overlays a tier name by id, leaving the other tiers and fields alone', () => {
    const doc = event([
      { id: 'a1', name: 'Standard', price: 10 },
      { id: 'b2', name: 'VIP', price: 50 },
    ])
    const out = overlayDocument(
      doc,
      'events',
      5,
      (sourceId, fieldPath) => (fieldPath === 'ticketTiers.b2.name' ? 'VIP FR' : null),
      true,
    ) as ReturnType<typeof event>
    expect(out.ticketTiers).toEqual([
      { id: 'a1', name: 'Standard', price: 10 },
      { id: 'b2', name: 'VIP FR', price: 50 },
    ])
  })

  it('a reorder keeps each translation attached to its tier: the row stays active', () => {
    const before = event([
      { id: 'a1', name: 'Standard', price: 10 },
      { id: 'b2', name: 'VIP', price: 50 },
    ])
    const after = event([
      { id: 'b2', name: 'VIP', price: 50 },
      { id: 'a1', name: 'Standard', price: 10 },
    ])
    const live: LiveDocument = {
      collection: 'events',
      documentId: '5',
      sourceId: 'events:5',
      title: 'Gala',
      slug: null,
      updatedAt: null,
      fields: new Map(fieldsForDocument('events', after).map((f) => [f.path, sourceTextOf(valueAtPath(after, f.path))])),
    }
    expect(fieldsForDocument('events', before).length).toBe(fieldsForDocument('events', after).length)
    expect(classifyTranslation({ fieldPath: 'ticketTiers.b2.name', sourceText: 'VIP' }, live, false)).toBe('active')
  })
})

describe('reusable sections are a translatable source', () => {
  it('lists the name and the text of its blocks, keyed to the section document', () => {
    const section = { id: 9, name: 'Footer CTA', description: '', blocks: [{ id: 'hb1', blockType: 'hero', heading: 'Join us' }] }
    const fields = fieldsForDocument('reusable-sections', section)
    expect(fields.map((f) => f.path)).toContain('name')
    expect(fields.map((f) => f.path)).toContain('blocks.hb1.heading')
  })
})
