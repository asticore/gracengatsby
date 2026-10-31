// Design model: upgrade-on-write from the visual editor style panel. A panel edit is stored in the
// unified grouped model, and every reader (asBlockStyle / readFlatDesign) gets the same flat style back.
import { describe, expect, it } from 'vitest'

import { asBlockStyle, type BlockStyle } from '@/lib/blockStyle'
import { readFlatDesign } from '@/lib/design/upgrade'
import { toStoredDesign } from '@/lib/design/storeDesign'

const styled = {
  bgType: 'color',
  bgColor: '#ffffff',
  paddingTop: 24,
  paddingBottom: 24,
  borderWidth: 2,
  borderStyle: 'dashed',
  borderColor: '#333333',
  borderRadius: 8,
  boxShadow: 'md',
  tablet: { paddingTop: 12 },
} as unknown as BlockStyle

describe('toStoredDesign (upgrade-on-write)', () => {
  it('stores grouped v2 with each setting under its group', () => {
    const stored = toStoredDesign(styled) as { schemaVersion: number; groups: Record<string, Record<string, unknown>> }
    expect(stored.schemaVersion).toBe(2)
    expect(stored.groups.border.boxShadow).toBe('md')
    expect(stored.groups.border.borderWidth).toBe(2)
    expect(stored.groups.background.bgColor).toBe('#ffffff')
    expect(stored.groups.spacing.paddingTop).toBe(24)
  })

  it('round-trips exactly through readFlatDesign', () => {
    expect(readFlatDesign(toStoredDesign(styled))).toEqual(styled)
  })

  it('renders the same as the flat style through asBlockStyle', () => {
    expect(asBlockStyle(toStoredDesign(styled))).toEqual(asBlockStyle(styled))
  })

  it('does not mutate the input style', () => {
    const copy = JSON.parse(JSON.stringify(styled))
    toStoredDesign(styled)
    expect(styled).toEqual(copy)
  })

  it('stores an empty style flat, so it still reads as empty', () => {
    const stored = toStoredDesign({} as BlockStyle)
    expect(stored).toEqual({})
    expect(asBlockStyle(stored)).toEqual({})
  })

  it('stores a style with only unknown keys flat, so nothing is lost', () => {
    const odd = { notAStyleKey: 'kept' } as unknown as BlockStyle
    const stored = toStoredDesign(odd)
    expect(stored).toEqual({ notAStyleKey: 'kept' })
    expect((asBlockStyle(stored) as Record<string, unknown>).notAStyleKey).toBe('kept')
  })

  it('a second write of a stored value keeps the same stored shape', () => {
    const once = toStoredDesign(styled)
    const twice = toStoredDesign(readFlatDesign(once) as BlockStyle)
    expect(twice).toEqual(once)
  })
})

describe('column write path keeps the grouped shape', () => {
  it('parseColumns and parseColumns of a section keep a grouped column design as stored', async () => {
    const { parseColumns } = await import('@/lib/sectionTree')
    const grouped = toStoredDesign(styled)
    const [column] = parseColumns([{ _id: 'c1', width: 12, design: grouped, blocks: [] }])
    expect(column.design).toEqual(grouped)
    expect(asBlockStyle(column.design)).toEqual(asBlockStyle(styled))
  })

  it('a flat column design is still read flat', async () => {
    const { parseColumns } = await import('@/lib/sectionTree')
    const [column] = parseColumns([{ _id: 'c2', width: 12, design: { bgType: 'color', bgColor: '#ffffff' }, blocks: [] }])
    expect(column.design).toEqual({ bgType: 'color', bgColor: '#ffffff' })
  })

  it('a grouped column design survives a second parse (write path round trip)', async () => {
    const { parseColumns } = await import('@/lib/sectionTree')
    const grouped = toStoredDesign(styled)
    const once = parseColumns([{ _id: 'c3', width: 12, design: grouped, blocks: [] }])
    const twice = parseColumns(JSON.parse(JSON.stringify(once)))
    expect(twice[0].design).toEqual(grouped)
  })
})
