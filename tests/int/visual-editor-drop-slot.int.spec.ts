import { describe, expect, it } from 'vitest'

import {
  clientToFrame,
  isLibraryDragTypes,
  resolveDropSlotInDoc,
  resolveSlotFromElement,
} from '@/views/visualEditor/dropSlot'

const rectOf = (top: number, height: number) =>
  ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: (): object => ({}) }) as DOMRect

const build = () => {
  document.body.innerHTML = `
    <div data-ve-root="1">
      <div data-ve-slot="1" data-ve-container="[]" data-ve-at="0" id="s0"></div>
      <div data-ve-node="[0]" id="n0"><span id="inner"></span>
        <div data-ve-column="[0,0]" id="col">
          <div data-ve-slot="1" data-ve-container="[0,0]" data-ve-at="0" id="c0"></div>
        </div>
      </div>
      <div data-ve-slot="1" data-ve-container="[]" data-ve-at="1" id="s1"></div>
      <div id="bare"></div>
    </div>`
  const n0 = document.getElementById('n0')!
  n0.getBoundingClientRect = () => rectOf(100, 100)
}

describe('drop slot resolution', () => {
  it('detects library drags from types only', () => {
    expect(isLibraryDragTypes(['application/x-ve-block'])).toBe(true)
    expect(isLibraryDragTypes(['application/x-ve-template'])).toBe(true)
    expect(isLibraryDragTypes(['Files'])).toBe(false)
    expect(isLibraryDragTypes(null)).toBe(false)
  })

  it('maps parent client coords into frame coords', () => {
    const rect = { left: 300, top: 50, width: 800, height: 600 }
    expect(clientToFrame(rect, 350, 70)).toEqual({ x: 50, y: 20 })
    expect(clientToFrame(rect, 100, 70)).toBeNull()
    expect(clientToFrame(rect, 350, 700)).toBeNull()
  })

  it('resolves a slot directly', () => {
    build()
    expect(resolveSlotFromElement(document.getElementById('s1'), 0)).toEqual({ containerPath: [], at: 1, key: '|1' })
  })

  it('resolves a block body to before/after by half', () => {
    build()
    const inner = document.getElementById('inner')
    expect(resolveSlotFromElement(inner, 120)?.at).toBe(0)
    expect(resolveSlotFromElement(inner, 180)?.at).toBe(1)
  })

  it('resolves a column to the end of its own list and the page to the end of the page', () => {
    build()
    expect(resolveSlotFromElement(document.getElementById('col'), 0)).toEqual({ containerPath: [0, 0], at: 0, key: '0.0|0' })
    expect(resolveSlotFromElement(document.getElementById('bare'), 0)).toEqual({ containerPath: [], at: 1, key: '|1' })
  })

  it('returns null outside any editor element and tolerates missing elementFromPoint', () => {
    document.body.innerHTML = '<div id="x"></div>'
    expect(resolveSlotFromElement(document.getElementById('x'), 0)).toBeNull()
    expect(resolveSlotFromElement(null, 0)).toBeNull()
    expect(resolveDropSlotInDoc({ elementFromPoint: (): null => null } as unknown as Document, 1, 1)).toBeNull()
  })
})
