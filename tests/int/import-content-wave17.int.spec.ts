import { describe, expect, it } from 'vitest'

import { decodeEntities } from '@/features/importContent/entities'
import { parseCsvItems } from '@/features/importContent/csvItems'
import { convertHtml, plainTextToHtml, safeUrl, stripShortcodes } from '@/features/importContent/htmlToBlocks'
import { cleanSlug, itemSlug, parseDate, statusFromWordPress } from '@/features/importContent/items'
import { parseMarkup, textOf } from '@/features/importContent/markup'
import { creationOrder, planItems, type ExistingIndex } from '@/features/importContent/plan'
import { detectFormat, parseImportText } from '@/features/importContent/parse'
import { parseWxr } from '@/features/importContent/wxr'
import { runImport, type ImportEngine } from '@/features/importContent/run'
import type { ContentType, ImportItem } from '@/features/importContent/types'

const BOM = String.fromCharCode(0xfeff)

function item(overrides: Partial<ImportItem> & { title: string }): ImportItem {
  return {
    ref: overrides.ref ?? `ref ${overrides.title}`,
    type: 'post',
    slug: '',
    html: '',
    excerpt: '',
    status: 'draft',
    date: null,
    parentSlug: null,
    categories: [],
    ...overrides,
  }
}

function emptyIndex(): ExistingIndex {
  return { page: new Map(), post: new Map() }
}

const ALL = { page: true, post: true }

describe('entities', () => {
  it('decodes named, decimal and hex references', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeEntities('&#8217;')).toBe(String.fromCodePoint(0x2019))
    expect(decodeEntities('&#x2014;')).toBe(String.fromCodePoint(0x2014))
    expect(decodeEntities('a&nbsp;b')).toBe(`a${String.fromCodePoint(0xa0)}b`)
  })

  it('leaves unknown names and out-of-range numbers as written', () => {
    expect(decodeEntities('&nosuch; &#0; &#99999999;')).toBe('&nosuch; &#0; &#99999999;')
    expect(decodeEntities('no entities here')).toBe('no entities here')
  })

  it('does not treat object-prototype names as entities', () => {
    expect(decodeEntities('&constructor;')).toBe('&constructor;')
  })
})

describe('markup reader', () => {
  it('closes unclosed tags and ignores stray closing tags', () => {
    const root = parseMarkup('<p>one<p>two</span></p>')
    expect(textOf(root)).toBe('onetwo')
  })

  it('keeps CDATA raw and drops comments and processing instructions', () => {
    const root = parseMarkup('<?xml version="1.0"?><!-- note --><a><![CDATA[<b>x &amp; y</b>]]></a>')
    expect(textOf(root)).toBe('<b>x &amp; y</b>')
  })

  it('reads attributes and treats void tags as empty', () => {
    const root = parseMarkup('<img src="a.jpg" alt=\'x\'><br>', { voidTags: new Set(['img', 'br']), lowerCase: true })
    const img = root.children[0]
    expect(img.name).toBe('img')
    expect(img.attrs.src).toBe('a.jpg')
    expect(img.attrs.alt).toBe('x')
    expect(img.children).toHaveLength(0)
    expect(root.children[1].name).toBe('br')
  })

  it('keeps raw script bodies unparsed', () => {
    const root = parseMarkup('<script>if (a < b) { x = "<p>"; }</script><p>ok</p>', { rawText: new Set(['script']), lowerCase: true })
    expect(root.children[0].text).toContain('a < b')
    expect(textOf(root.children[1])).toBe('ok')
  })

  it('drops a leading byte order mark', () => {
    expect(textOf(parseMarkup(`${BOM}<t>hi</t>`))).toBe('hi')
  })
})

describe('shortcodes and safe links', () => {
  it('removes shortcode tags and keeps their text', () => {
    expect(stripShortcodes('[caption id="1" align="left"]Photo credit[/caption]')).toBe('Photo credit')
    expect(stripShortcodes('[gallery ids="1,2"] and [embed]')).toBe(' and ')
  })

  it('keeps bracketed words that are not shortcodes', () => {
    expect(stripShortcodes('[Read more] and [1]')).toBe('[Read more] and [1]')
  })

  it('allows web, mail, phone and relative links only', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com')
    expect(safeUrl('tel:+6100000000')).toBe('tel:+6100000000')
    expect(safeUrl('/shop')).toBe('/shop')
    expect(safeUrl('#top')).toBe('#top')
  })

  it('blocks script and data links, including obfuscated ones', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('  JavaScript:alert(1)')).toBeNull()
    expect(safeUrl('java\tscript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,hi')).toBeNull()
    expect(safeUrl('')).toBeNull()
    expect(safeUrl(undefined)).toBeNull()
  })
})

describe('HTML to editor content', () => {
  it('removes scripts, styles and iframes; counts embeds', () => {
    const converted = convertHtml('<p>Hello</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><p>World</p>')
    expect(JSON.stringify(converted.children)).not.toContain('alert')
    expect(converted.embedsRemoved).toBe(1)
    expect(converted.children.map((node) => node.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('removes WordPress block comments', () => {
    const converted = convertHtml('<!-- wp:paragraph --><p>Kept</p><!-- /wp:paragraph -->')
    expect(converted.children).toHaveLength(1)
    expect(JSON.stringify(converted.children)).toContain('Kept')
    expect(JSON.stringify(converted.children)).not.toContain('wp:paragraph')
  })

  it('turns images into their address as text and counts them', () => {
    const converted = convertHtml('<p><img src="https://old.example.com/a.jpg" alt="x"></p><img src="/b.png">')
    expect(converted.imagesNotCopied).toBe(2)
    expect(JSON.stringify(converted.children)).toContain('https://old.example.com/a.jpg')
    expect(JSON.stringify(converted.children)).toContain('/b.png')
  })

  it('maps headings, with h5 and h6 becoming h4', () => {
    const converted = convertHtml('<h1>One</h1><h2>Two</h2><h5>Five</h5>')
    expect(converted.children.map((node) => node.tag)).toEqual(['h1', 'h2', 'h4'])
  })

  it('keeps bold and italic as text formats', () => {
    const converted = convertHtml('<p><strong>Bold</strong> and <em>soft</em></p>')
    const [paragraphNode] = converted.children
    const children = paragraphNode.children as Array<{ text: string; format: number }>
    expect(children.find((node) => node.text === 'Bold')?.format).toBe(1)
    expect(children.find((node) => node.text === 'soft')?.format).toBe(2)
  })

  it('keeps safe links and drops unsafe ones but keeps their words', () => {
    const converted = convertHtml('<p><a href="https://example.com" target="_blank">Site</a> <a href="javascript:x">Bad</a></p>')
    const children = converted.children[0].children as Array<{ type: string; fields?: { url: string; newTab: boolean } }>
    const link = children.find((node) => node.type === 'link')
    expect(link?.fields).toEqual({ linkType: 'custom', url: 'https://example.com', newTab: true })
    expect(JSON.stringify(children)).toContain('Bad')
    expect(children.filter((node) => node.type === 'link')).toHaveLength(1)
  })

  it('builds bullet, numbered and nested lists', () => {
    const converted = convertHtml('<ul><li>a</li><li>b<ol><li>c</li></ol></li></ul><ol><li>d</li></ol>')
    expect(converted.children.map((node) => node.listType)).toEqual(['bullet', 'number'])
    const first = converted.children[0].children as Array<{ value: number; children: Array<{ type: string }> }>
    expect(first.map((node) => node.value)).toEqual([1, 2])
    expect(first[1].children.some((child) => child.type === 'list')).toBe(true)
  })

  it('turns blockquotes, rules and table rows into blocks', () => {
    const converted = convertHtml('<blockquote>Quote</blockquote><hr><table><tr><td>A</td><td>B</td></tr></table>')
    expect(converted.children.map((node) => node.type)).toEqual(['quote', 'horizontalrule', 'paragraph'])
    const cells = (converted.children[2].children as Array<{ text: string }>).map((node) => node.text).join('')
    expect(cells).toBe('A | B')
  })

  it('drops empty paragraphs and collapses whitespace', () => {
    const converted = convertHtml('<p>   </p><p>  spaced \n   out  </p>')
    expect(converted.children).toHaveLength(1)
    expect(JSON.stringify(converted.children)).toContain('spaced out')
  })

  it('removes shortcodes but keeps caption text', () => {
    const converted = convertHtml('<p>[caption id="x"]Caption words[/caption]</p>')
    expect(JSON.stringify(converted.children)).toContain('Caption words')
    expect(JSON.stringify(converted.children)).not.toContain('[caption')
  })

  it('wraps plain text lines as paragraphs', () => {
    expect(plainTextToHtml('First line\n\nSecond line')).toBe('<p>First line</p><p>Second line</p>')
  })
})

describe('slugs, dates and status', () => {
  it('cleans slugs to lower-case letters, digits and hyphens', () => {
    expect(cleanSlug('  Hello, World!  ')).toBe('hello-world')
    expect(cleanSlug('Caf%C3%A9 Menu')).toBe('cafe-menu')
    expect(cleanSlug('---')).toBe('')
  })

  it('falls back to the title when the slug is empty', () => {
    expect(itemSlug({ slug: '', title: 'My First Post' })).toBe('my-first-post')
    expect(itemSlug({ slug: 'custom-one', title: 'Other' })).toBe('custom-one')
    expect(itemSlug({ slug: '', title: '!!!' })).toBe('untitled')
  })

  it('reads WordPress GMT dates and rejects empty or zero dates', () => {
    expect(parseDate('2024-03-05 10:20:30')).toBe('2024-03-05T10:20:30Z')
    expect(parseDate('2024-03-05')).toBe('2024-03-05T00:00:00Z')
    expect(parseDate('0000-00-00 00:00:00')).toBeNull()
    expect(parseDate('next tuesday')).toBeNull()
    expect(parseDate('2024-13-45')).toBeNull()
  })

  it('maps only publish to published', () => {
    expect(statusFromWordPress('publish')).toBe('published')
    expect(statusFromWordPress('draft')).toBe('draft')
    expect(statusFromWordPress('pending')).toBe('draft')
    expect(statusFromWordPress('private')).toBe('draft')
    expect(statusFromWordPress('future')).toBe('draft')
  })
})

const WXR = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
<channel>
  <title>Example</title>
  <item>
    <title>Tom &amp; Jerry&#8217;s Post</title>
    <wp:post_id>10</wp:post_id>
    <wp:post_type>post</wp:post_type>
    <wp:post_name>tom-and-jerry</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_date_gmt>2024-03-05 10:20:30</wp:post_date_gmt>
    <wp:post_parent>0</wp:post_parent>
    <category domain="category" nicename="news"><![CDATA[News]]></category>
    <category domain="post_tag" nicename="tag"><![CDATA[Tag]]></category>
    <category domain="category" nicename="news"><![CDATA[News]]></category>
    <excerpt:encoded><![CDATA[Short]]></excerpt:encoded>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>Body <strong>text</strong></p><!-- /wp:paragraph -->]]></content:encoded>
  </item>
  <item>
    <title>Draft post</title>
    <wp:post_id>11</wp:post_id>
    <wp:post_type>post</wp:post_type>
    <wp:status>draft</wp:status>
    <content:encoded><![CDATA[Draft body]]></content:encoded>
  </item>
  <item>
    <title>Parent page</title>
    <wp:post_id>20</wp:post_id>
    <wp:post_type>page</wp:post_type>
    <wp:post_name>about</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <content:encoded><![CDATA[<p>About</p>]]></content:encoded>
  </item>
  <item>
    <title>Child page</title>
    <wp:post_id>21</wp:post_id>
    <wp:post_type>page</wp:post_type>
    <wp:post_name>team</wp:post_name>
    <wp:status>private</wp:status>
    <wp:post_parent>20</wp:post_parent>
    <content:encoded><![CDATA[<p>Team</p>]]></content:encoded>
  </item>
  <item>
    <title>Lost child</title>
    <wp:post_id>22</wp:post_id>
    <wp:post_type>page</wp:post_type>
    <wp:status>publish</wp:status>
    <wp:post_parent>999</wp:post_parent>
  </item>
  <item>
    <title>A picture</title>
    <wp:post_id>30</wp:post_id>
    <wp:post_type>attachment</wp:post_type>
    <wp:status>inherit</wp:status>
  </item>
  <item>
    <title>Menu entry</title>
    <wp:post_id>31</wp:post_id>
    <wp:post_type>nav_menu_item</wp:post_type>
    <wp:status>publish</wp:status>
  </item>
  <item>
    <title>Old revision</title>
    <wp:post_id>32</wp:post_id>
    <wp:post_type>revision</wp:post_type>
    <wp:status>inherit</wp:status>
  </item>
  <item>
    <title>Binned</title>
    <wp:post_id>33</wp:post_id>
    <wp:post_type>post</wp:post_type>
    <wp:status>trash</wp:status>
  </item>
</channel>
</rss>`

describe('WordPress export reader', () => {
  it('keeps posts and pages and counts the entries it leaves out', () => {
    const parsed = parseWxr(WXR)
    expect(parsed.errors).toEqual([])
    expect(parsed.items.map((row) => row.title)).toEqual(['Tom & Jerry’s Post', 'Draft post', 'Parent page', 'Child page', 'Lost child'])
    expect(parsed.skipped).toBe(4)
  })

  it('maps statuses and reads the post body, excerpt, date and categories', () => {
    const [post] = parseWxr(WXR).items
    expect(post.type).toBe('post')
    expect(post.status).toBe('published')
    expect(post.slug).toBe('tom-and-jerry')
    expect(post.excerpt).toBe('Short')
    expect(post.date).toBe('2024-03-05T10:20:30Z')
    expect(post.categories).toEqual(['News'])
    expect(post.html).toContain('<strong>text</strong>')
    expect(parseWxr(WXR).items[1].status).toBe('draft')
  })

  it('links child pages to their parent by slug and warns about missing parents', () => {
    const parsed = parseWxr(WXR)
    const child = parsed.items.find((row) => row.title === 'Child page')
    const lost = parsed.items.find((row) => row.title === 'Lost child')
    expect(child?.parentSlug).toBe('about')
    expect(child?.status).toBe('draft')
    expect(lost?.parentSlug).toBeNull()
    expect(parsed.warnings.join(' ')).toContain('1 page(s) had a parent')
  })

  it('reports a file that is not a WordPress export', () => {
    const parsed = parseWxr('<html><body>hello</body></html>')
    expect(parsed.items).toEqual([])
    expect(parsed.errors[0]).toContain('no channel')
  })
})

describe('CSV reader', () => {
  it('reads named columns, with header names normalised', () => {
    const parsed = parseCsvItems(`${BOM}Title,Slug,Content,Status,Type\nHello,hello,<p>Hi</p>,publish,post\nAbout Us,,Plain line,draft,page\n`)
    expect(parsed.errors).toEqual([])
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toMatchObject({ title: 'Hello', slug: 'hello', html: '<p>Hi</p>', status: 'published', type: 'post' })
    expect(parsed.items[1]).toMatchObject({ title: 'About Us', type: 'page', status: 'draft', html: '<p>Plain line</p>' })
  })

  it('splits categories on the bar and links pages with parent_slug', () => {
    const parsed = parseCsvItems('title,type,parent_slug,categories\nChild,page,about,\nNews item,post,,News| Events |\n')
    expect(parsed.items[0].parentSlug).toBe('about')
    expect(parsed.items[1].categories).toEqual(['News', 'Events'])
  })

  it('needs a title column and skips rows without a title', () => {
    expect(parseCsvItems('name,body\nx,y\n').errors[0]).toContain('title')
    const parsed = parseCsvItems('title,status\n,draft\nKeep,draft\n')
    expect(parsed.items.map((row) => row.title)).toEqual(['Keep'])
    expect(parsed.errors[0]).toContain('no title')
  })

  it('rejects an unknown type on one row and warns about unused columns', () => {
    const parsed = parseCsvItems('title,type,colour\nA,video,red\nB,page,blue\n')
    expect(parsed.items.map((row) => row.title)).toEqual(['B'])
    expect(parsed.errors[0]).toContain('"video"')
    expect(parsed.warnings[0]).toContain('colour')
  })

  it('warns when a date cannot be read', () => {
    const parsed = parseCsvItems('title,date\nA,someday\nB,2025-02-01\n')
    expect(parsed.items[0].date).toBeNull()
    expect(parsed.items[1].date).toBe('2025-02-01T00:00:00Z')
    expect(parsed.warnings[0]).toContain('someday')
  })

  it('refuses files with more than 500 rows', () => {
    const rows = Array.from({ length: 600 }, (_, index) => `Item ${index}`).join('\n')
    const parsed = parseCsvItems(`title\n${rows}\n`)
    expect(parsed.items).toEqual([])
    expect(parsed.errors[0]).toContain('500')
  })

  it('detects the format from the name first, then from the first character', () => {
    expect(detectFormat('anything', 'site.xml')).toBe('wxr')
    expect(detectFormat('title\nA', 'data.csv')).toBe('csv')
    expect(detectFormat(`${BOM}  <rss>`)).toBe('wxr')
    expect(detectFormat('title,slug\nA,a')).toBe('csv')
    expect(parseImportText(WXR).format).toBe('wxr')
  })
})

describe('planning', () => {
  const existing = (): ExistingIndex => ({
    page: new Map([['about', { id: 1, draft: false }]]),
    post: new Map([
      ['hello', { id: 2, draft: true }],
      ['news', { id: 3, draft: false }],
    ]),
  })

  it('creates new items and refuses types the user cannot create', () => {
    const plan = planItems([item({ title: 'Fresh' })], emptyIndex(), { conflicts: 'skip', keepPublished: false, allowed: ALL })
    expect(plan.rows[0]).toMatchObject({ action: 'create', slug: 'fresh', status: 'draft', conflict: false })
    const denied = planItems([item({ title: 'Fresh', type: 'page' })], emptyIndex(), { conflicts: 'skip', keepPublished: false, allowed: { page: false, post: true } })
    expect(denied.rows[0].action).toBe('error')
    expect(denied.rows[0].reason).toContain('pages')
  })

  it('skips existing addresses by default', () => {
    const plan = planItems([item({ title: 'Hello' }), item({ title: 'News' })], existing(), { conflicts: 'skip', keepPublished: false, allowed: ALL })
    expect(plan.rows.map((row) => row.action)).toEqual(['skip', 'skip'])
    expect(plan.counts.skip).toBe(2)
  })

  it('replaces only existing drafts in overwrite-drafts-only mode', () => {
    const plan = planItems([item({ title: 'Hello' }), item({ title: 'News' })], existing(), {
      conflicts: 'overwrite-drafts-only',
      keepPublished: false,
      allowed: ALL,
    })
    expect(plan.rows[0]).toMatchObject({ action: 'update', existingId: 2 })
    expect(plan.rows[1].action).toBe('skip')
    expect(plan.rows[1].reason).toContain('published')
  })

  it('saves a copy under a new address in create-with-suffix mode', () => {
    const plan = planItems(
      [item({ title: 'Hello' }), item({ title: 'Hello' }), item({ title: 'Hello', slug: 'hello-2' })],
      existing(),
      { conflicts: 'create-with-suffix', keepPublished: false, allowed: ALL },
    )
    expect(plan.rows.map((row) => row.slug)).toEqual(['hello-2', 'hello-3', 'hello-2-2'])
    expect(plan.rows.every((row) => row.action === 'create')).toBe(true)
  })

  it('skips a second item that repeats an address earlier in the same file', () => {
    const plan = planItems([item({ title: 'Same' }), item({ title: 'Same' })], emptyIndex(), { conflicts: 'skip', keepPublished: false, allowed: ALL })
    expect(plan.rows.map((row) => row.action)).toEqual(['create', 'skip'])
    expect(plan.rows[1].reason).toContain('earlier in this file')
  })

  it('only keeps published status when asked, and never for drafts', () => {
    const plan = planItems([item({ title: 'Live', status: 'published' }), item({ title: 'Later', status: 'draft' })], emptyIndex(), {
      conflicts: 'skip',
      keepPublished: true,
      allowed: ALL,
    })
    expect(plan.rows.map((row) => row.status)).toEqual(['published', 'draft'])
    const safe = planItems([item({ title: 'Live', status: 'published' })], emptyIndex(), { conflicts: 'skip', keepPublished: false, allowed: ALL })
    expect(safe.rows[0].status).toBe('draft')
  })

  it('orders posts first and pages so parents come before children', () => {
    const items: ImportItem[] = [
      item({ title: 'Team', type: 'page', slug: 'team', parentSlug: 'about' }),
      item({ title: 'Post' }),
      item({ title: 'About', type: 'page', slug: 'about' }),
      item({ title: 'Deep', type: 'page', slug: 'deep', parentSlug: 'team' }),
    ]
    const order = creationOrder(items).map((index) => items[index].title)
    expect(order).toEqual(['Post', 'About', 'Team', 'Deep'])
  })

  it('does not loop forever on a parent cycle', () => {
    const items: ImportItem[] = [
      item({ title: 'A', type: 'page', slug: 'a', parentSlug: 'b' }),
      item({ title: 'B', type: 'page', slug: 'b', parentSlug: 'a' }),
    ]
    expect(creationOrder(items)).toHaveLength(2)
  })

  it('plans by content type, so a page and a post may share an address', () => {
    const types: ContentType[] = ['page', 'post']
    const plan = planItems(
      types.map((type) => item({ title: 'Shared', type })),
      { page: new Map(), post: new Map([['shared', { id: 9, draft: false }]]) },
      { conflicts: 'skip', keepPublished: false, allowed: ALL },
    )
    expect(plan.rows.map((row) => row.action)).toEqual(['create', 'skip'])
  })
})

describe('import writes through a fake engine', () => {
  type Row = { id: number; collection: string; slug: string; _status: string }
  const existingRows: Row[] = [
    { id: 7, collection: 'posts', slug: 'hello', _status: 'draft' },
    { id: 8, collection: 'pages', slug: 'contact', _status: 'published' },
  ]

  function fakeEngine() {
    const calls: Array<{ op: string; args: Record<string, unknown> }> = []
    let nextId = 100
    const engine: ImportEngine = {
      find: async (args) => {
        const wanted = (args.where as { slug: { in: string[] } }).slug.in
        return { docs: existingRows.filter((row) => row.collection === args.collection && wanted.includes(row.slug)) }
      },
      create: async (args) => {
        calls.push({ op: 'create', args })
        if (args.data && (args.data as { slug: string }).slug === 'boom') throw new Error('The slug is taken.')
        return { id: nextId++ }
      },
      update: async (args) => {
        calls.push({ op: 'update', args })
        return {}
      },
    }
    return { engine, calls }
  }

  it('creates parents before children, links them, replaces drafts and collects failures', async () => {
    const { engine, calls } = fakeEngine()
    const user = { id: 1, email: 'editor@example.test' }
    const items: ImportItem[] = [
      item({ title: 'Hello', html: '<p>Again</p>' }),
      item({ title: 'Boom' }),
      item({ title: 'About', type: 'page', slug: 'about', html: '<p>About us</p>' }),
      item({ title: 'Team', type: 'page', slug: 'team', parentSlug: 'about', html: '<p>Team</p>' }),
      item({ title: 'Contact', type: 'page', slug: 'contact' }),
    ]
    const result = await runImport(engine, user, items, { conflicts: 'overwrite-drafts-only', keepPublished: false, allowed: ALL })

    expect(result).toMatchObject({ created: 2, updated: 1, skipped: 1, failed: 1 })
    expect(result.errors).toEqual([{ ref: 'ref Boom', title: 'Boom', message: 'The slug is taken.' }])
    expect(calls.map((call) => `${call.op}:${call.args.collection}`)).toEqual([
      'update:posts',
      'create:posts',
      'create:pages',
      'create:pages',
    ])
    expect(calls.every((call) => call.args.user === user && call.args.draft === true)).toBe(true)
    expect(calls[0].args).toMatchObject({ id: 7 })
    const team = calls[3].args.data as { parent?: number; blocks: Array<{ blockType: string }> }
    expect(team.parent).toBe(100)
    expect(team.blocks[0].blockType).toBe('richText')
  })

  it('keeps published status only when asked and never writes a plain draft as published', async () => {
    const { engine, calls } = fakeEngine()
    await runImport(engine, null, [item({ title: 'Live', status: 'published' }), item({ title: 'Later' })], {
      conflicts: 'skip',
      keepPublished: true,
      allowed: ALL,
    })
    expect(calls.map((call) => call.args.draft)).toEqual([false, true])
    expect((calls[0].args.data as { _status?: string })._status).toBe('published')
    expect((calls[1].args.data as { _status?: string })._status).toBeUndefined()
  })
})
