import { describe, expect, it } from 'vitest'

import type { ArchiveItem } from '@/lib/blockContext'
import { loopItemBlocks } from '@/features/siteTemplates/loopGrid'
import { loopMergeValue, resolveLoopMergeTags, resolveLoopMergeTagsInRichText, safeLoopLink } from '@/features/siteTemplates/loopMergeTags'

const item: ArchiveItem = {
  title: 'Silver ring',
  href: '/shop/silver-ring',
  excerpt: 'Hand cut',
  date: '2026-10-05T00:00:00.000Z',
  price: 49.5,
  image: { url: 'https://cdn.example.com/ring.jpg', alt: 'Ring' },
  author: 'Grace',
  categories: ['Jewellery', 'Gifts'],
  tags: [],
}

describe('resolveLoopMergeTags', () => {
  it('replaces each known tag with the item value', () => {
    expect(resolveLoopMergeTags('{{title}} by {{author}}', item)).toBe('Silver ring by Grace')
    expect(resolveLoopMergeTags('{{excerpt}}', item)).toBe('Hand cut')
    expect(resolveLoopMergeTags('{{url}}', item)).toBe('/shop/silver-ring')
    expect(resolveLoopMergeTags('{{image}}', item)).toBe('https://cdn.example.com/ring.jpg')
    expect(resolveLoopMergeTags('{{category}}', item)).toBe('Jewellery')
  })

  it('formats price in dollars and date short, as the other date and price tags do', () => {
    expect(resolveLoopMergeTags('{{price}}', item)).toBe(loopMergeValue('price', item))
    expect(loopMergeValue('price', item)).toContain('49.50')
    expect(resolveLoopMergeTags('{{date}}', item)).toBe(loopMergeValue('date', item))
    expect(resolveLoopMergeTags('{{date}}', item)).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('leaves unknown tags exactly as typed', () => {
    expect(resolveLoopMergeTags('{{post.title}} and {{nope}} {{ field:x }}', item)).toBe('{{post.title}} and {{nope}} {{ field:x }}')
  })

  it('accepts spaces inside the braces and any letter case', () => {
    expect(resolveLoopMergeTags('{{ Title }} / {{TITLE}}', item)).toBe('Silver ring / Silver ring')
  })

  it('gives an empty string for a field the item does not have', () => {
    const bare: ArchiveItem = { title: 'Bare', href: '/x' }
    expect(resolveLoopMergeTags('[{{excerpt}}][{{price}}][{{image}}][{{category}}][{{author}}]', bare)).toBe('[][][][][]')
  })

  it('returns text without braces unchanged', () => {
    expect(resolveLoopMergeTags('plain text', item)).toBe('plain text')
  })
})

describe('rich text and link props', () => {
  it('resolves the text nodes of a rich text tree and keeps its structure', () => {
    const tree = { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'From {{author}}', format: 1 }] }] } }
    const out = resolveLoopMergeTagsInRichText(tree, item) as typeof tree
    expect(out.root.children[0].children[0]).toEqual({ type: 'text', text: 'From Grace', format: 1 })
    expect(tree.root.children[0].children[0].text).toBe('From {{author}}')
  })

  it('refuses a resolved link that is not a safe address', () => {
    expect(safeLoopLink('javascript:alert(1)')).toBe('')
    expect(safeLoopLink('/shop/x')).toBe('/shop/x')
    expect(safeLoopLink('https://example.com')).toBe('https://example.com')
    expect(safeLoopLink('//evil.example')).toBe('')
  })
})

describe('loopItemBlocks applies the item to text-like elements', () => {
  const template = [
    { blockType: 'element', elementType: 'heading', props: { text: '{{title}}', tag: 'h3', link: '{{url}}' } },
    { blockType: 'element', elementType: 'button', props: { text: 'Buy {{title}}', url: '{{url}}' } },
    { blockType: 'element', elementType: 'text-editor', props: { content: { root: { children: [{ type: 'text', text: '{{excerpt}}' }] } } } },
    { blockType: 'element', elementType: 'divider', props: { label: '{{title}}' } },
    {
      blockType: 'section',
      columns: [{ blocks: [{ blockType: 'element', elementType: 'heading', props: { text: '{{category}}' } }] }],
    },
  ]

  it('fills heading, button and rich text, and leaves other elements alone', () => {
    const [heading, button, editor, divider, section] = loopItemBlocks(template, item) as Array<{
      props?: Record<string, unknown>
      columns?: { blocks: { props: Record<string, unknown> }[] }[]
    }>
    expect(heading.props).toMatchObject({ text: 'Silver ring', tag: 'h3', link: '/shop/silver-ring' })
    expect(button.props).toMatchObject({ text: 'Buy Silver ring', url: '/shop/silver-ring' })
    expect(JSON.stringify(editor.props)).toContain('"text":"Hand cut"')
    expect(divider.props).toEqual({ label: '{{title}}' })
    expect(section.columns?.[0].blocks[0].props.text).toBe('Jewellery')
  })

  it('does not change the stored template blocks', () => {
    loopItemBlocks(template, item)
    expect(template[0].props).toEqual({ text: '{{title}}', tag: 'h3', link: '{{url}}' })
  })

  it('drops a link tag that resolves to an unsafe address', () => {
    const bad = [{ blockType: 'element', elementType: 'button', props: { text: 'x', url: '{{title}}' } }]
    const [out] = loopItemBlocks(bad, { ...item, title: 'javascript:alert(1)' }) as Array<{ props: Record<string, unknown> }>
    expect(out.props.url).toBe('')
  })
})
