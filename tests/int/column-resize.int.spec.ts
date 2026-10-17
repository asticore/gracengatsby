import { describe, expect, it } from 'vitest'

import type { SectionColumn, SectionNode } from '@/lib/sectionTree'
import { applyColumnWidths, columnPercentFor, resizeAdjacent } from '@/views/visualEditor/columnOps'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('resizeAdjacent', () => {
  it('moves only the boundary between the two columns and keeps their sum', () => {
    const out = resizeAdjacent([50, 50], 0, 10)
    expect(out).toEqual([60, 40])
    expect(sum(out)).toBe(100)
  })

  it('leaves the columns that are not on the boundary untouched', () => {
    expect(resizeAdjacent([20, 30, 50], 0, 5)).toEqual([25, 25, 50])
    expect(resizeAdjacent([20, 30, 50], 1, -10)).toEqual([20, 20, 60])
    expect(resizeAdjacent([20, 30, 25, 25], 2, 4)).toEqual([20, 30, 29, 21])
  })

  it('preserves the sum of the pair for any delta', () => {
    const base = [33.33, 66.67, 40, 60]
    for (let d = -120; d <= 120; d += 3.7) {
      for (let i = 0; i < base.length - 1; i++) {
        const out = resizeAdjacent(base, i, d)
        expect(out[i] + out[i + 1]).toBeCloseTo(base[i] + base[i + 1], 6)
        out.forEach((w, k) => {
          if (k !== i && k !== i + 1) expect(w).toBe(base[k])
        })
      }
    }
  })

  it('clamps each column to the 10..90 range by default', () => {
    expect(resizeAdjacent([50, 50], 0, 100)).toEqual([90, 10])
    expect(resizeAdjacent([50, 50], 0, -100)).toEqual([10, 90])
    expect(resizeAdjacent([50, 50], 0, 39.4)).toEqual([89, 11])
  })

  it('honours custom bounds', () => {
    expect(resizeAdjacent([50, 50], 0, 100, 20, 60)).toEqual([60, 40])
    expect(resizeAdjacent([50, 50], 0, -100, 20, 60)).toEqual([40, 60])
  })

  it('snaps the moved column to whole percents', () => {
    expect(resizeAdjacent([50, 50], 0, 3.4)).toEqual([53, 47])
    expect(resizeAdjacent([50, 50], 0, 3.6)).toEqual([54, 46])
    expect(resizeAdjacent([50, 50], 0, -3.6)).toEqual([46, 54])
  })

  it('returns a copy unchanged for a bad index or delta', () => {
    const widths = [40, 60]
    expect(resizeAdjacent(widths, 1, 5)).toEqual([40, 60])
    expect(resizeAdjacent(widths, -1, 5)).toEqual([40, 60])
    expect(resizeAdjacent(widths, 0, Number.NaN)).toEqual([40, 60])
    expect(resizeAdjacent(widths, 0, 0)).not.toBe(widths)
  })
})

describe('column widths per device', () => {
  const column = (extra: Partial<SectionColumn>): SectionColumn => ({ _id: 'c', design: {}, blocks: [], ...extra }) as SectionColumn

  it('reads the fraction and percent widths, cascading tablet and mobile from the wider device', () => {
    const c = column({ widthDesktop: { value: 6, unit: 'fraction' } })
    expect(columnPercentFor(c, 'desktop')).toBe(50)
    expect(columnPercentFor(c, 'tablet')).toBe(50)
    expect(columnPercentFor(c, 'mobile')).toBe(50)
    const overridden = column({ widthDesktop: { value: 6, unit: 'fraction' }, widthMobile: { value: 100, unit: 'percent' } })
    expect(columnPercentFor(overridden, 'mobile')).toBe(100)
    expect(columnPercentFor(column({ widthDesktop: { value: 0, unit: 'auto' } }), 'desktop')).toBeNull()
  })

  it('writes percent widths only for the columns that changed, on the device shown', () => {
    const section = {
      blockType: 'section',
      _id: 's',
      columns: [
        column({ _id: 'a', widthDesktop: { value: 6, unit: 'fraction' } }),
        column({ _id: 'b', widthDesktop: { value: 6, unit: 'fraction' } }),
        column({ _id: 'c', widthDesktop: { value: 12, unit: 'fraction' } }),
      ],
    } as unknown as SectionNode
    const blocks = [section]
    const out = applyColumnWidths(blocks, [0], [60, 40, 100], 'tablet')
    const cols = out[0].columns as SectionColumn[]
    expect(cols[0].widthTablet).toEqual({ value: 60, unit: 'percent' })
    expect(cols[1].widthTablet).toEqual({ value: 40, unit: 'percent' })
    expect(cols[2]).toBe((section.columns as SectionColumn[])[2])
    expect(cols[0].widthDesktop).toEqual({ value: 6, unit: 'fraction' })
    expect(applyColumnWidths(blocks, [0], [50, 50, 100], 'desktop')).toBe(blocks)
  })
})
