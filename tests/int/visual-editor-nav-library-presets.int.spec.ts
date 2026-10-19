import { describe, expect, it } from 'vitest'

import { isHiddenEverywhere, planKeyMove, planNavDrop, toggleHideEverywhere, zoneFromOffset } from '@/views/visualEditor/navigatorOps'
import { MAX_RECENTS, pushRecent, sanitiseList, toggleFavourite } from '@/views/visualEditor/libraryRecents'
import { MAX_PRESETS, addPreset, applyPresetDesign, removePreset, sanitisePresets } from '@/views/visualEditor/stylePresets'
import { serializeStyle } from '@/views/visualEditor/editorClipboard'
import { blockStyleCss } from '@/lib/blockStyle'
import { moveNode } from '@/views/visualEditor/treeOps'

describe('navigatorOps', () => {
  it('toggles hide on every device and back', () => {
    const on = toggleHideEverywhere({ bgColor: '#fff', hideOnMobile: true })
    expect(isHiddenEverywhere(on)).toBe(true)
    expect(on.hideOnMobile).toBeUndefined()
    expect(blockStyleCss(on as never, 'x')).toContain('display:none')
    const off = toggleHideEverywhere(on)
    expect(off).toEqual({ bgColor: '#fff' })
  })
  it('plans drops and key moves', () => {
    expect(planNavDrop([1], false, 'before')).toEqual({ containerPath: [], at: 1 })
    expect(planNavDrop([1, 0, 2], false, 'after')).toEqual({ containerPath: [1, 0], at: 3 })
    expect(planNavDrop([1, 0], true, 'inside', 4)).toEqual({ containerPath: [1, 0], at: 4 })
    expect(planNavDrop([1, 0], true, 'before')).toBeNull()
    expect(planKeyMove([0], -1, 3)).toBeNull()
    expect(planKeyMove([1], 1, 3)).toEqual({ containerPath: [], at: 3 })
    expect(zoneFromOffset(2, 20, false)).toBe('before')
    const blocks = [{ blockType: 'a' }, { blockType: 'b' }, { blockType: 'c' }] as never[]
    const plan = planKeyMove([0], 1, 3)!
    expect((moveNode(blocks, [0], plan.containerPath, plan.at) as unknown as { blockType: string }[]).map((b) => b.blockType)).toEqual(['b', 'a', 'c'])
  })
})

describe('libraryRecents', () => {
  it('keeps most recent six, unique', () => {
    let l: string[] = []
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'c']) l = pushRecent(l, s)
    expect(l).toEqual(['c', 'g', 'f', 'e', 'd', 'b'])
    expect(l.length).toBe(MAX_RECENTS)
  })
  it('toggles favourites and sanitises storage', () => {
    expect(toggleFavourite(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleFavourite(['a', 'b'], 'a')).toEqual(['b'])
    expect(sanitiseList('["a",1,"a","z"]', new Set(['a']))).toEqual(['a'])
    expect(sanitiseList('not json')).toEqual([])
  })
})

describe('stylePresets', () => {
  const text = serializeStyle({ bgColor: '#123456' }, 'desktop')!.text
  it('adds, caps and removes', () => {
    let l = addPreset([], ' Hero ', text, '1')
    expect(l).toEqual([{ id: '1', name: 'Hero', text }])
    expect(addPreset(l, '', text, '2')).toEqual(l)
    l = addPreset(l, 'hero', text, '3')
    expect(l.length).toBe(1)
    for (let i = 0; i < 40; i++) l = addPreset(l, `n${i}`, text, `i${i}`)
    expect(l.length).toBe(MAX_PRESETS)
    expect(removePreset(l, l[0].id).length).toBe(MAX_PRESETS - 1)
  })
  it('sanitises stored junk', () => {
    expect(sanitisePresets(JSON.stringify([{ id: 'a', name: 'ok', text }, { id: 'b', name: 'bad', text: 'x' }, 5]))).toHaveLength(1)
    expect(sanitisePresets('{')).toEqual([])
  })
  it('applies on same and other device', () => {
    expect(applyPresetDesign({ x: 1 }, text, 'desktop')).toEqual({ bgColor: '#123456' })
    expect(applyPresetDesign({ x: 1 }, text, 'mobile')).toEqual({ x: 1, desktop: { bgColor: '#123456' } })
    expect(applyPresetDesign({}, 'junk', 'desktop')).toBeNull()
  })
})
