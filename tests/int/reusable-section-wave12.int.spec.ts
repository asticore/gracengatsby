// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { ReusableSectionBlock } from '@/blocks/ReusableSection'
import { contentBlocks } from '@/blocks'
import {
  REUSABLE_CHAIN_KEY,
  REUSABLE_SECTION_MAX_DEPTH,
  canExpandReusableSection,
  reusableChainOf,
  reusableSectionIdOf,
  tagReusableSections,
} from '@/lib/reusableSection'
import type { SectionNode } from '@/lib/sectionTree'

describe('reusableSectionIdOf', () => {
  it('reads a bare id, a numeric string and a populated doc', () => {
    expect(reusableSectionIdOf(7)).toBe(7)
    expect(reusableSectionIdOf('12')).toBe(12)
    expect(reusableSectionIdOf({ id: 3, name: 'Footer strip' })).toBe(3)
  })

  it('rejects missing, zero, negative and malformed values', () => {
    expect(reusableSectionIdOf(null)).toBeNull()
    expect(reusableSectionIdOf(undefined)).toBeNull()
    expect(reusableSectionIdOf(0)).toBeNull()
    expect(reusableSectionIdOf(-4)).toBeNull()
    expect(reusableSectionIdOf(2.5)).toBeNull()
    expect(reusableSectionIdOf('abc')).toBeNull()
    expect(reusableSectionIdOf({ name: 'no id' })).toBeNull()
  })
})

describe('canExpandReusableSection', () => {
  it('expands a section that is not already open', () => {
    expect(canExpandReusableSection(5, [])).toBe(true)
    expect(canExpandReusableSection(5, [1, 2])).toBe(true)
  })

  it('refuses a missing id', () => {
    expect(canExpandReusableSection(null, [])).toBe(false)
  })

  it('refuses a section that is already in the chain, which covers a section containing itself', () => {
    expect(canExpandReusableSection(5, [5])).toBe(false)
    expect(canExpandReusableSection(5, [1, 5, 2])).toBe(false)
  })

  it('refuses once the chain reaches the depth limit', () => {
    const chain = Array.from({ length: REUSABLE_SECTION_MAX_DEPTH }, (_, i) => i + 100)
    expect(canExpandReusableSection(7, chain)).toBe(false)
    expect(canExpandReusableSection(7, chain.slice(1))).toBe(true)
  })
})

describe('reusableChainOf', () => {
  it('keeps only positive integers from a recorded chain', () => {
    expect(reusableChainOf([1, 2, 3])).toEqual([1, 2, 3])
    expect(reusableChainOf([1, 'x', -2, 0, 2.5, null, 4])).toEqual([1, 4])
  })

  it('returns an empty chain for anything that is not an array', () => {
    expect(reusableChainOf(undefined)).toEqual([])
    expect(reusableChainOf('1,2')).toEqual([])
  })
})

describe('tagReusableSections', () => {
  const nested = (sectionId: number): SectionNode => ({ blockType: 'reusableSection', section: sectionId })

  it('tags reusable section nodes at the top level and leaves other blocks alone', () => {
    const blocks: SectionNode[] = [{ blockType: 'hero', heading: 'Hi' }, nested(9)]
    const tagged = tagReusableSections(blocks, [1])
    expect(tagged[0]).toBe(blocks[0])
    expect(tagged[1]).toEqual({ blockType: 'reusableSection', section: 9, [REUSABLE_CHAIN_KEY]: [1] })
  })

  it('tags reusable section nodes nested inside Section columns', () => {
    const blocks: SectionNode[] = [
      {
        blockType: 'section',
        columns: [
          { blocks: [{ blockType: 'richText', content: 'x' }, nested(4)] },
          { blocks: [{ blockType: 'section', columns: [{ blocks: [nested(6)] }] }] },
        ],
      },
    ]
    const [section] = tagReusableSections(blocks, [2])
    const columns = section.columns as { blocks: SectionNode[] }[]
    expect(columns[0].blocks[1][REUSABLE_CHAIN_KEY]).toEqual([2])
    const inner = (columns[1].blocks[0].columns as { blocks: SectionNode[] }[])[0].blocks[0]
    expect(inner[REUSABLE_CHAIN_KEY]).toEqual([2])
  })

  it('does not change the input', () => {
    const blocks: SectionNode[] = [nested(9)]
    tagReusableSections(blocks, [1])
    expect(blocks[0][REUSABLE_CHAIN_KEY]).toBeUndefined()
  })

  it('copies the chain so later changes to it do not leak into other nodes', () => {
    const chain = [1]
    const [a, b] = tagReusableSections([nested(2), nested(3)], chain)
    chain.push(99)
    expect(a[REUSABLE_CHAIN_KEY]).toEqual([1])
    expect(b[REUSABLE_CHAIN_KEY]).toEqual([1])
  })
})

describe('reusable section block registration', () => {
  it('is part of the content blocks, with a required section reference', () => {
    expect(contentBlocks).toContain(ReusableSectionBlock)
    expect(ReusableSectionBlock.slug).toBe('reusableSection')
    const field = ReusableSectionBlock.fields.find((f) => 'name' in f && f.name === 'section') as { type: string; relationTo: string; required?: boolean }
    expect(field.type).toBe('relationship')
    expect(field.relationTo).toBe('reusable-sections')
    expect(field.required).toBe(true)
  })
})