// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildPattern, escapeRegExp, humaniseField, parseFindReplace, replaceInDocument } from '@/features/editScreens/findReplace'
import { applyPlan, planFindReplace, type RunEngine } from '@/features/editScreens/findReplaceRun'
import { annotatePage, buildTocTree, levelsFor, slugify, uniqueId } from '@/features/editScreens/toc'
import { TableOfContentsBlock } from '@/components/blocks/TableOfContentsBlock'
import { RichText } from '@/localapi/richtext'
import { TableOfContentsBlock as TocBlockConfig } from '@/blocks/TableOfContents'
import { pageBuilderBlocks } from '@/blocks'

const paragraph = (text: string) => ({ type: 'paragraph', children: [{ type: 'text', text, format: 0 }] })
const heading = (tag: string, text: string) => ({ type: 'heading', tag, children: [{ type: 'text', text, format: 0 }] })
const doc = (...children: unknown[]) => ({ root: { type: 'root', children } })

describe('find and replace: parsing', () => {
  it('rejects an empty search and a missing body', () => {
    expect(parseFindReplace(null)).toEqual({ ok: false, error: 'Send a JSON body.' })
    expect(parseFindReplace({ find: '   ', replace: 'x', collections: ['pages'] })).toMatchObject({ ok: false })
  })

  it('rejects oversized text and unknown places', () => {
    expect(parseFindReplace({ find: 'a'.repeat(201), replace: '', collections: ['pages'] })).toMatchObject({ ok: false })
    expect(parseFindReplace({ find: 'a', replace: 'b'.repeat(501), collections: ['pages'] })).toMatchObject({ ok: false })
    expect(parseFindReplace({ find: 'a', replace: 'b', collections: ['users'] })).toMatchObject({ ok: false })
    expect(parseFindReplace({ find: 'a', replace: 'b', collections: [] })).toMatchObject({ ok: false })
  })

  it('accepts an empty replacement (delete) and de-duplicates places', () => {
    const parsed = parseFindReplace({ find: 'old ', replace: '', collections: ['pages', 'pages', 'events'] })
    expect(parsed).toMatchObject({ ok: true, options: { replace: '', collections: ['pages', 'events'], caseSensitive: false, wholeWord: false } })
  })

  it('refuses a case-insensitive replacement that changes nothing', () => {
    expect(parseFindReplace({ find: 'same', replace: 'same', collections: ['pages'] })).toMatchObject({ ok: false })
  })
})

describe('find and replace: matcher', () => {
  it('escapes every regular expression character', () => {
    expect(escapeRegExp('a.b*c+(d)[e]{f}|g^h$i\\j?')).toBe('a\\.b\\*c\\+\\(d\\)\\[e\\]\\{f\\}\\|g\\^h\\$i\\\\j\\?')
  })

  it('treats the search text literally', () => {
    const pattern = buildPattern('a.b (c)', { caseSensitive: true, wholeWord: false })
    expect('a.b (c) and axb'.match(pattern)).toEqual(['a.b (c)'])
  })

  it('ignores case unless asked to match it', () => {
    const loose = buildPattern('store', { caseSensitive: false, wholeWord: false })
    const strict = buildPattern('store', { caseSensitive: true, wholeWord: false })
    expect('Store STORE store'.match(loose)).toHaveLength(3)
    expect('Store STORE store'.match(strict)).toHaveLength(1)
  })

  it('matches whole words only when asked, including accented words', () => {
    const pattern = buildPattern('cat', { caseSensitive: false, wholeWord: true })
    expect('cat cats concat cat_ cat.'.match(pattern)).toHaveLength(2)
    const accented = buildPattern('cafe', { caseSensitive: false, wholeWord: true })
    expect('cafe cafes'.match(accented)).toHaveLength(1)
  })

  it('turns field keys into plain labels', () => {
    expect(humaniseField('seoTitle')).toBe('Seo title')
    expect(humaniseField('blocks')).toBe('Blocks')
  })
})

describe('find and replace: replacing inside documents', () => {
  const store = doc(paragraph('Visit our Store today'), heading('h2', 'Store hours'))

  it('changes only readable text, never ids, urls or the rich text structure', () => {
    const page = {
      id: 5,
      title: 'Store guide',
      slug: 'store',
      content: { root: { type: 'root', children: [{ type: 'link', url: 'https://example.com/store', fields: { url: 'https://example.com/store' }, children: [{ type: 'text', text: 'Store', format: 0 }] }] } },
      blocks: [{ blockType: 'richText', id: 'store-block', content: store, design: { backgroundColor: 'store' } }],
    }
    const pattern = buildPattern('store', { caseSensitive: false, wholeWord: false })
    const outcome = replaceInDocument(page, pattern, 'Shop', 10)

    // title, the link's text, and the two text nodes of the rich text block
    expect(outcome.count).toBe(4)
    expect(Object.keys(outcome.patch).sort()).toEqual(['blocks', 'content', 'title'])
    expect(outcome.patch.title).toBe('Shop guide')
    expect(JSON.stringify(outcome.patch)).toContain('https://example.com/store')
    expect(outcome.patch.blocks).toEqual([{ blockType: 'richText', id: 'store-block', content: doc(paragraph('Visit our Shop today'), heading('h2', 'Shop hours')), design: { backgroundColor: 'store' } }])
    // the input is not modified
    expect(page.title).toBe('Store guide')
  })

  it('does not write a field that only holds the replacement already', () => {
    const pattern = buildPattern('Hello', { caseSensitive: false, wholeWord: false })
    const outcome = replaceInDocument({ id: 1, title: 'Hello' }, pattern, 'hello')
    expect(outcome.count).toBe(1)
    expect(outcome.patch).toEqual({ title: 'hello' })
    const same = replaceInDocument({ id: 1, title: 'hello' }, buildPattern('hello', { caseSensitive: true, wholeWord: false }), 'hello')
    expect(same).toEqual({ count: 0, patch: {}, samples: [] })
  })

  it('inserts the replacement literally, with no $ patterns expanded', () => {
    const outcome = replaceInDocument({ id: 1, title: 'a.b (c) and axb' }, buildPattern('a.b', { caseSensitive: true, wholeWord: false }), '$&$1')
    expect(outcome.patch.title).toBe('$&$1 (c) and axb')
  })

  it('returns sample context around each match, up to the limit', () => {
    const outcome = replaceInDocument({ id: 1, title: 'one two one three one' }, buildPattern('one', { caseSensitive: true, wholeWord: false }), 'ONE', 2, 5)
    expect(outcome.count).toBe(3)
    expect(outcome.samples).toEqual([
      { field: 'Title', before: '', match: 'one', after: ' two ' },
      { field: 'Title', before: ' two ', match: 'one', after: ' thre' },
    ])
  })
})

describe('find and replace: planning and applying', () => {
  const docs: Record<string, Array<Record<string, unknown>>> = {
    pages: [
      { id: 1, title: 'Hello world', body: 'Say hello' },
      { id: 2, title: 'Hello again', trashedAt: '2026-01-01T00:00:00.000Z' },
      { id: 3, title: 'Nothing here' },
    ],
    events: [{ id: 9, title: 'Hello party' }],
  }

  const fakeEngine = (updates: Array<{ collection: string; id: number | string; data: Record<string, unknown> }>, failId?: number | string): RunEngine => ({
    find: async ({ collection }) => ({ docs: docs[collection] ?? [], hasNextPage: false }),
    update: async (args) => {
      if (args.id === failId) throw new Error('Locked by another person.')
      updates.push({ collection: args.collection, id: args.id, data: args.data })
      return args.data
    },
  })

  const options = { find: 'hello', replace: 'Hi', caseSensitive: false, wholeWord: false, collections: ['pages', 'events'] as const }

  it('previews counts per place, skips trashed items and writes nothing', async () => {
    const updates: Array<{ collection: string; id: number | string; data: Record<string, unknown> }> = []
    const plan = await planFindReplace(fakeEngine(updates), null, { ...options, collections: [...options.collections] })
    expect(plan.perCollection.pages).toEqual({ documents: 1, matches: 2 })
    expect(plan.perCollection.events).toEqual({ documents: 1, matches: 1 })
    expect(plan.matches).toBe(3)
    expect(plan.samples.map((s) => `${s.collection}:${s.id}`)).toEqual(['pages:1', 'pages:1', 'events:9'])
    expect(updates).toEqual([])
  })

  it('applies only the changed fields, as the signed-in user, and reports a refused item on its own', async () => {
    const updates: Array<{ collection: string; id: number | string; data: Record<string, unknown> }> = []
    const plan = await planFindReplace(fakeEngine(updates), { id: 7 }, { ...options, collections: [...options.collections] })
    const rows = await applyPlan(fakeEngine(updates, 9), { id: 7 }, plan)
    expect(updates).toEqual([{ collection: 'pages', id: 1, data: { title: 'Hi world', body: 'Say Hi' } }])
    expect(rows).toEqual([
      { collection: 'pages', id: 1, ok: true },
      { collection: 'events', id: 9, ok: false, error: 'Locked by another person.' },
    ])
  })

  it('marks a plan truncated when a place holds more than the scan reads', async () => {
    const big = Array.from({ length: 2001 }, (_, i) => ({ id: i + 1, title: 'hello' }))
    const engine: RunEngine = {
      find: async ({ page = 1 }) => ({ docs: big.slice((page - 1) * 250, page * 250), hasNextPage: page < 9 }),
      update: async () => null,
    }
    const plan = await planFindReplace(engine, null, { find: 'hello', replace: 'hi', caseSensitive: false, wholeWord: false, collections: ['pages'] })
    expect(plan.truncated).toBe(true)
  })
})

describe('table of contents: slugs and ids', () => {
  it('folds accents, keeps letters from any script and falls back to "section"', () => {
    expect(slugify('Café Menu & Prices!')).toBe('cafe-menu-prices')
    expect(slugify('  Set up  ')).toBe('set-up')
    expect(slugify('¿¿¿')).toBe('section')
  })

  it('makes repeated ids unique in reading order', () => {
    const used = new Set<string>()
    expect([uniqueId('setup', used), uniqueId('setup', used), uniqueId('setup', used)]).toEqual(['setup', 'setup-2', 'setup-3'])
  })
})

describe('table of contents: extracting headings from a page', () => {
  const page = {
    body: doc(heading('h2', 'Intro'), paragraph('Words')),
    blocks: [
      { blockType: 'richText', content: doc(heading('h2', 'Setup'), heading('h3', 'Details'), heading('h1', 'Ignored title')) },
      {
        blockType: 'section',
        columns: [{ blocks: [{ blockType: 'imageText', content: doc(heading('h4', 'Deep'), heading('h2', 'Setup')) }] }],
      },
      { blockType: 'toc', title: 'Contents' },
    ],
  }

  it('gives every h2-h4 heading a unique id in reading order and skips h1', () => {
    const { headings } = annotatePage(page)
    expect(headings.map((h) => [h.level, h.text, h.id])).toEqual([
      [2, 'Intro', 'intro'],
      [2, 'Setup', 'setup'],
      [3, 'Details', 'details'],
      [4, 'Deep', 'deep'],
      [2, 'Setup', 'setup-2'],
    ])
  })

  it('writes the ids onto the heading nodes without touching the input', () => {
    const { blocks } = annotatePage(page)
    const first = (blocks as Array<{ content: { root: { children: Array<{ htmlId?: string }> } } }>)[0].content.root.children[0]
    expect(first.htmlId).toBe('setup')
    expect(page.blocks[0].content.root.children[0]).not.toHaveProperty('htmlId')
  })

  it('fills the table of contents block with the page headings', () => {
    const { blocks } = annotatePage(page)
    const toc = (blocks as Array<{ blockType: string; headings?: unknown[] }>)[2]
    expect(toc.headings).toHaveLength(5)
  })
})

describe('table of contents: nesting and levels', () => {
  const headings = [
    { id: 'a', level: 2 as const, text: 'A' },
    { id: 'a1', level: 3 as const, text: 'A1' },
    { id: 'a1a', level: 4 as const, text: 'A1a' },
    { id: 'b', level: 2 as const, text: 'B' },
    { id: 'b1', level: 3 as const, text: 'B1' },
  ]

  it('nests sub headings under the nearest heading above them', () => {
    const tree = buildTocTree(headings, levelsFor('h2-h4'))
    expect(tree.map((n) => n.heading.id)).toEqual(['a', 'b'])
    expect(tree[0].children[0].heading.id).toBe('a1')
    expect(tree[0].children[0].children[0].heading.id).toBe('a1a')
    expect(tree[1].children.map((n) => n.heading.id)).toEqual(['b1'])
  })

  it('shows only the chosen levels', () => {
    expect(buildTocTree(headings, levelsFor('h2')).every((n) => n.children.length === 0)).toBe(true)
    expect(buildTocTree(headings, levelsFor('h2-h3'))[0].children[0].children).toEqual([])
    expect(levelsFor('h2-h4')).toEqual([2, 3, 4])
  })

  it('puts a sub heading at the top when its main heading is hidden', () => {
    const tree = buildTocTree([{ id: 'x', level: 3, text: 'X' }], levelsFor('h2-h3'))
    expect(tree.map((n) => n.heading.id)).toEqual(['x'])
  })
})

describe('table of contents: rendering', () => {
  const headings = [
    { id: 'setup', level: 2 as const, text: 'Setup' },
    { id: 'details', level: 3 as const, text: 'Details' },
  ]

  it('renders a nested list of links with no script', () => {
    const html = renderToStaticMarkup(React.createElement(TableOfContentsBlock, { title: 'On this page', levels: 'h2-h4', collapsible: false, headings }))
    expect(html).toContain('href="#setup"')
    expect(html).toContain('href="#details"')
    expect(html).toContain('On this page')
    expect(html).not.toContain('<details')
    expect(html).not.toContain('<script')
  })

  it('wraps the list in a details element when collapsible', () => {
    const html = renderToStaticMarkup(React.createElement(TableOfContentsBlock, { title: '', levels: 'h2', collapsible: true, headings }))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Contents')
    expect(html).not.toContain('href="#details"')
  })

  it('renders nothing when there are no headings to list', () => {
    expect(renderToStaticMarkup(React.createElement(TableOfContentsBlock, { headings: [] }))).toBe('')
  })

  it('gives the rendered heading the id the table of contents links to', () => {
    const { blocks } = annotatePage({ blocks: [{ blockType: 'richText', content: doc(heading('h2', 'Setup')) }] })
    const content = (blocks as Array<{ content: unknown }>)[0].content
    const html = renderToStaticMarkup(React.createElement(RichText, { data: content }))
    expect(html).toContain('<h2 id="setup">Setup</h2>')
  })

  it('is registered in the page-builder block library with its own config', () => {
    expect(pageBuilderBlocks).toContain(TocBlockConfig)
    expect(TocBlockConfig.slug).toBe('toc')
  })
})
