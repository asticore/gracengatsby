import { describe, expect, it } from 'vitest'

import { mergeTagFor, OPTION_SLUG_PLACEHOLDER } from '@/features/customFields/mergeTagHint'

describe('mergeTagFor', () => {
  it('gives a plain document tag for a top-level field', () => {
    expect(mergeTagFor({ name: 'price', type: 'number' })).toEqual({ tag: '{{field:price}}', note: null })
  })

  it('defaults to document mode when no mode is given', () => {
    expect(mergeTagFor({ name: 'price' }).tag).toBe('{{field:price}}')
  })

  it('adds row index 0 and a note for a sub field of repeating rows', () => {
    const info = mergeTagFor({ name: 'column', type: 'text', parentPath: [{ name: 'rows', type: 'repeater' }] })
    expect(info.tag).toBe('{{field:rows.0.column}}')
    expect(info.note).toContain('change 0 to 1 for the second row')
  })

  it('adds row index 0 for flexible layouts too', () => {
    expect(mergeTagFor({ name: 'title', parentPath: [{ name: 'blocks', type: 'flexible' }] }).tag).toBe('{{field:blocks.0.title}}')
  })

  it('does not add an index for a group, but keeps the dotted path', () => {
    const info = mergeTagFor({ name: 'city', parentPath: [{ name: 'address', type: 'group' }] })
    expect(info.tag).toBe('{{field:address.city}}')
    expect(info.note).toBeNull()
  })

  it('indexes every repeating row on the way down', () => {
    const tag = mergeTagFor({
      name: 'amount',
      parentPath: [
        { name: 'rows', type: 'repeater' },
        { name: 'prices', type: 'group' },
      ],
    }).tag
    expect(tag).toBe('{{field:rows.0.prices.amount}}')
  })

  it('uses the option tag with the known options page slug', () => {
    expect(mergeTagFor({ name: 'phone', mode: 'option', optionsSlug: 'business' })).toEqual({ tag: '{{option:business.phone}}', note: null })
  })

  it('uses the slug placeholder and a note when the options slug is unknown', () => {
    const info = mergeTagFor({ name: 'phone', mode: 'option', optionsSlug: null })
    expect(info.tag).toBe(`{{option:${OPTION_SLUG_PLACEHOLDER}.phone}}`)
    expect(info.note).toContain('Replace <slug>')
  })

  it('points a repeating field at a column tag instead of itself', () => {
    const info = mergeTagFor({ name: 'rows', type: 'repeater' })
    expect(info.tag).toBe('{{field:rows}}')
    expect(info.note).toContain('{{field:rows.0.column}}')
  })
})
