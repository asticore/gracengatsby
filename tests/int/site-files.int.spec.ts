// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildManifest,
  buildPlainTextFile,
  buildSecurityTxt,
  describeSiteFiles,
  evaluateExpires,
  htmlToText,
  isBlockedPath,
  normaliseContact,
  parseBlockedPaths,
  parseResponseHeaders,
  plainTextState,
  richTextToText,
  securityTxtState,
  type SiteFilesSettings,
} from '@/features/seo/siteFiles'

const NOW = new Date('2026-10-10T00:00:00.000Z')

// --- Shared mock state for the route tests ----------------------------------

const state = vi.hoisted(() => ({
  seo: null as Record<string, unknown> | null,
  site: null as Record<string, unknown> | null,
  flags: { seo: true, blog: true, ecommerce: true, events: true } as Record<string, boolean>,
  docs: {} as Record<string, unknown[]>,
  pages: [] as unknown[],
  protectedIds: new Set<number>(),
  /** Protected document ids per collection, as the eg_content_passwords table holds them. */
  protectedRows: { pages: [4], posts: [11] } as Record<string, number[]>,
  dbCalls: 0,
  rules: { headers: [] as [string, string][], blockedPaths: [] as string[] },
  gateThrows: false,
  d1: null as null | { row: { headers: string | null; blocked: string | null } | null; fail: boolean; calls: number },
}))

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    findGlobal: async ({ slug }: { slug: string }) => (slug === 'seo-settings' ? state.seo : state.site),
    find: async ({ collection }: { collection: string }) => ({ docs: state.docs[collection] ?? [] }),
  }),
}))
vi.mock('@/utilities/features', () => ({ getFeatureFlags: async () => state.flags }))
vi.mock('@/utilities/pagePaths', () => ({ getAllResolvedPages: async () => state.pages }))
vi.mock('@/cms/db/connect', () => ({
  getDb: async () => ({
    // One query per collection: the mock answers with that collection's protected ids.
    all: async (query: { queryChunks: unknown[] }) => {
      state.dbCalls += 1
      if (state.gateThrows) throw new Error('db down')
      // The bound collection is a plain string chunk, or a Param carrying one.
      const bound = query.queryChunks.find(
        (chunk) => typeof chunk === 'string' || (chunk !== null && typeof chunk === 'object' && 'encoder' in chunk),
      )
      const collection = bound === undefined ? '' : String(typeof bound === 'object' ? (bound as { value: unknown }).value : bound)
      return (state.protectedRows[collection] ?? []).map((doc_id) => ({ doc_id }))
    },
  }),
}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { D1: state.d1 ? makeD1() : null } }),
}))

/** A D1 stand-in whose settings row can be made to fail, and counts its reads. */
function makeD1() {
  return {
    prepare: () => ({
      first: async () => {
        const d1 = state.d1!
        d1.calls += 1
        if (d1.fail) throw new Error('D1 unavailable')
        return d1.row
      },
    }),
  }
}
vi.mock('@/cms/db/contentPasswords', () => ({
  getPasswordHash: async (_db: unknown, _collection: string, id: number) => {
    if (state.gateThrows) throw new Error('db down')
    return state.protectedIds.has(id) ? 'hash' : null
  },
}))
vi.mock('@/features/seo/serverRules', () => ({
  readServerRules: async () => state.rules,
}))
vi.mock('@/features/redirects', () => ({
  // Every path has a redirect, so the tests can tell whether the guard skipped it.
  resolveRedirect: async () => ({ id: 1, to: '/moved', status: 301 }),
  recordRedirectHit: async (): Promise<void> => undefined,
}))

// --- Text helpers -----------------------------------------------------------

describe('htmlToText', () => {
  it('drops tags and script bodies, and decodes entities once', () => {
    const text = htmlToText('<p>Hello &amp; <b>world</b></p><script>alert(1)</script><style>p{}</style>')
    expect(text).toContain('Hello & world')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('<')
    expect(text).not.toContain('p{}')
  })

  it('removes an unterminated script and a dangling tag', () => {
    const text = htmlToText('Keep this <script>steal()')
    expect(text).toContain('Keep this')
    expect(text).not.toContain('steal')
    expect(htmlToText('Visible <b')).toBe('Visible')
  })

  it('decodes an escaped ampersand as text, not as a further entity', () => {
    expect(htmlToText('Tom &amp;amp; Jerry')).toBe('Tom &amp; Jerry')
  })
})

describe('richTextToText', () => {
  it('reads a rich-text node tree and a block list, but not URLs or ids', () => {
    const lexical = { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hi there' }] }] } }
    expect(richTextToText(lexical)).toBe('Hi there')

    const blocks = [{ blockType: 'hero', heading: 'Welcome', link: '/go', id: 'abc' }]
    const text = richTextToText(blocks)
    expect(text).toContain('Welcome')
    expect(text).not.toContain('/go')
    expect(text).not.toContain('abc')
  })

  it('caps the length', () => {
    const text = richTextToText('word '.repeat(2000), 100)
    expect(text.length).toBeLessThanOrEqual(100)
  })
})

// --- llms.txt ---------------------------------------------------------------

describe('buildLlmsTxt', () => {
  it('writes the llmstxt.org layout and skips empty sections', () => {
    const body = buildLlmsTxt({
      title: 'Grace & Gatsby',
      summary: 'A boutique.\nSecond line',
      sections: [
        {
          heading: 'Pages',
          items: [{ title: 'About [us]', url: 'https://x.test/about', description: 'Our story' }],
        },
        { heading: 'Posts', items: [] },
      ],
    })
    expect(body.startsWith('# Grace & Gatsby\n\n> A boutique. Second line\n')).toBe(true)
    expect(body).toContain('## Pages\n\n- [About us](https://x.test/about): Our story')
    expect(body).not.toContain('## Posts')
    expect(body.endsWith('\n')).toBe(true)
  })

  it('omits the summary line when there is none', () => {
    const body = buildLlmsTxt({ title: 'Site', sections: [] })
    expect(body).toBe('# Site\n')
  })
})

describe('buildLlmsFullTxt', () => {
  it('appends bodies and never writes past the byte cap', () => {
    const long = 'lorem ipsum '.repeat(40)
    const sections = [
      {
        heading: 'Pages',
        items: Array.from({ length: 20 }, (_, i) => ({
          title: `Page ${i}`,
          url: `https://x.test/p${i}`,
          body: long,
        })),
      },
    ]
    const full = buildLlmsFullTxt({ title: 'Site', sections }, 1500)
    expect(new TextEncoder().encode(full).length).toBeLessThanOrEqual(1500)
    expect(full).toContain('cut short')
    // The last item written is complete: its URL line is followed by its body.
    const urlLines = full.split('\n').filter((line) => line.startsWith('URL: '))
    expect(urlLines.length).toBeGreaterThan(0)
    expect(urlLines.length).toBeLessThan(20)
    expect(full).toContain(`### Page 0`)
  })

  it('includes every body when it fits', () => {
    const full = buildLlmsFullTxt({
      title: 'Site',
      sections: [{ heading: 'Posts', items: [{ title: 'Hello', url: 'https://x.test/blog/hello', body: 'First post.' }] }],
    })
    expect(full).toContain('### Hello\nURL: https://x.test/blog/hello\n\nFirst post.')
    expect(full).not.toContain('cut short')
  })
})

// --- security.txt -----------------------------------------------------------

describe('evaluateExpires', () => {
  it('reads a date, a timed value, and reports missing, invalid and expired', () => {
    expect(evaluateExpires('', NOW)).toEqual({ state: 'missing' })
    expect(evaluateExpires('31/12/2027', NOW)).toEqual({ state: 'invalid' })
    expect(evaluateExpires('2027-02-30x', NOW)).toEqual({ state: 'invalid' })
    expect(evaluateExpires('2020-01-01', NOW)).toEqual({ state: 'expired' })
    expect(evaluateExpires('2026-10-10', NOW)).toEqual({ state: 'expired' })
    expect(evaluateExpires('2027-12-31', NOW)).toEqual({ state: 'valid', iso: '2027-12-31T00:00:00.000Z' })
    expect(evaluateExpires('2027-12-31T10:00:00+10:00', NOW)).toEqual({
      state: 'valid',
      iso: '2027-12-31T00:00:00.000Z',
    })
  })
})

describe('normaliseContact', () => {
  it('accepts an address, mailto, tel and https, and refuses the rest', () => {
    expect(normaliseContact('security@gracengatsby.com')).toBe('mailto:security@gracengatsby.com')
    expect(normaliseContact('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(normaliseContact('tel:+61400000000')).toBe('tel:+61400000000')
    expect(normaliseContact('https://example.com/security')).toBe('https://example.com/security')
    expect(normaliseContact('http://example.com/security')).toBeNull()
    expect(normaliseContact('a b@c.de')).toBeNull()
    expect(normaliseContact('')).toBeNull()
  })
})

describe('buildSecurityTxt', () => {
  const base: SiteFilesSettings = {
    securityTxtContact: 'security@gracengatsby.com',
    securityTxtExpires: '2027-12-31',
    securityTxtPolicy: 'https://gracengatsby.com/policy',
    securityTxtLanguages: 'en, fr',
  }

  it('builds the RFC 9116 fields with a canonical URL', () => {
    expect(buildSecurityTxt(base, 'https://gracengatsby.com/', NOW)).toBe(
      [
        'Contact: mailto:security@gracengatsby.com',
        'Expires: 2027-12-31T00:00:00.000Z',
        'Policy: https://gracengatsby.com/policy',
        'Preferred-Languages: en, fr',
        'Canonical: https://gracengatsby.com/.well-known/security.txt',
      ].join('\n') + '\n',
    )
  })

  it('leaves out an invalid optional value without refusing the file', () => {
    const body = buildSecurityTxt({ ...base, securityTxtPolicy: 'http://insecure.test', securityTxtLanguages: '??' }, 'https://gracengatsby.com', NOW)
    expect(body).not.toBeNull()
    expect(body).not.toContain('Policy:')
    expect(body).not.toContain('Preferred-Languages:')
  })

  it('is not served once the expiry has passed', () => {
    expect(buildSecurityTxt({ ...base, securityTxtExpires: '2026-01-01' }, 'https://gracengatsby.com', NOW)).toBeNull()
  })

  it('is not served without a contact', () => {
    expect(buildSecurityTxt({ ...base, securityTxtContact: '' }, 'https://gracengatsby.com', NOW)).toBeNull()
  })

  it('serves a custom body verbatim, even if the expiry has passed', () => {
    const custom = 'Contact: https://example.com/x\nExpires: 2020-01-01T00:00:00Z\n'
    expect(buildSecurityTxt({ securityTxtCustom: custom }, 'https://gracengatsby.com', NOW)).toBe(custom)
  })

  it('refuses a custom body over 100 KB', () => {
    expect(buildSecurityTxt({ securityTxtCustom: 'x'.repeat(100_001) }, 'https://gracengatsby.com', NOW)).toBeNull()
  })

  it('explains why the file is off', () => {
    expect(securityTxtState({}, NOW).state).toBe('empty')
    const noExpiry = securityTxtState({ securityTxtContact: 'a@b.co' }, NOW)
    expect(noExpiry.state).toBe('off')
    expect(noExpiry.reason).toMatch(/expiry/i)
    expect(securityTxtState({ ...base, securityTxtExpires: '2026-01-01' }, NOW).state).toBe('off')
    expect(securityTxtState(base, NOW).state).toBe('served')
  })
})

// --- ads.txt, app-ads.txt, humans.txt ---------------------------------------

describe('buildPlainTextFile', () => {
  it('trims, strips control characters and adds one final newline', () => {
    expect(buildPlainTextFile('  hello\u0007 world  ')).toBe('hello world\n')
  })

  it('returns nothing when blank', () => {
    expect(buildPlainTextFile('   \n  ')).toBeNull()
    expect(buildPlainTextFile(undefined)).toBeNull()
  })

  it('withholds a file over 100 KB rather than cutting it', () => {
    expect(buildPlainTextFile('a'.repeat(100_001))).toBeNull()
    expect(buildPlainTextFile('a'.repeat(100_000))).not.toBeNull()
    expect(plainTextState('a'.repeat(100_001)).state).toBe('off')
    expect(plainTextState('   ').state).toBe('empty')
  })
})

// --- Web app manifest -------------------------------------------------------

describe('buildManifest', () => {
  it('falls back to the site name and builds a short name from it', () => {
    const manifest = buildManifest({ siteName: 'Grace & Gatsby', settings: {} })
    expect(manifest).not.toBeNull()
    expect(manifest?.name).toBe('Grace & Gatsby')
    expect(manifest?.short_name).toBe(Array.from('Grace & Gatsby').slice(0, 12).join(''))
    expect(manifest?.start_url).toBe('/')
    expect(manifest?.display).toBe('standalone')
    expect(manifest?.icons).toBeUndefined()
  })

  it('keeps hex colours in any case, drops anything else, and falls back on a bad display mode', () => {
    const manifest = buildManifest({
      siteName: 'Site',
      settings: {
        manifestThemeColor: '#1F2230',
        manifestBackgroundColor: 'red',
        manifestDisplay: 'fullscreen',
      },
    })
    expect(manifest?.theme_color).toBe('#1F2230')
    expect(manifest?.background_color).toBeUndefined()
    expect(manifest?.display).toBe('standalone')
  })

  it('lists the favicon and logo as icons', () => {
    const manifest = buildManifest({
      siteName: 'Site',
      settings: { manifestDisplay: 'minimal-ui' },
      iconUrls: { favicon: '/media/fav.png', logo: '/media/logo.png' },
    })
    expect(manifest?.display).toBe('minimal-ui')
    expect(manifest?.icons).toEqual([
      { src: '/media/fav.png', sizes: 'any' },
      { src: '/media/logo.png', sizes: 'any', purpose: 'any' },
    ])
  })

  it('returns nothing when there is no name at all', () => {
    expect(buildManifest({ siteName: '', settings: {} })).toBeNull()
  })
})

// --- Server response headers ------------------------------------------------

describe('parseResponseHeaders', () => {
  it('keeps valid lines and rejects each unsafe one with a reason', () => {
    const { headers, rejected } = parseResponseHeaders(
      [
        '# comment',
        'X-Robots-Tag: noarchive',
        'Set-Cookie: a=b',
        'Content-Type: text/evil',
        'Bad Name: x',
        'X-Empty:',
        'NoColon',
        'X-Robots-Tag: duplicate',
        'X-Ok: a\rinjected',
      ].join('\n'),
    )
    expect(headers).toEqual([
      ['X-Robots-Tag', 'noarchive'],
      ['X-Ok', 'a'],
    ])
    const reasons = rejected.map((r) => r.line)
    expect(reasons).toEqual(
      expect.arrayContaining(['Set-Cookie: a=b', 'Content-Type: text/evil', 'Bad Name: x', 'X-Empty:', 'NoColon', 'X-Robots-Tag: duplicate', 'injected']),
    )
  })

  it('never produces a value containing a line break', () => {
    const { headers } = parseResponseHeaders('X-Test: one\r\nSet-Cookie: stolen=1')
    for (const [name, value] of headers) {
      expect(name).not.toMatch(/[\r\n]/)
      expect(value).not.toMatch(/[\r\n]/)
    }
    expect(headers.map(([name]) => name.toLowerCase())).not.toContain('set-cookie')
  })

  it('caps the number of headers', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `X-Header-${i}: v`).join('\n')
    expect(parseResponseHeaders(lines).headers).toHaveLength(50)
  })

  it('refuses a value with a character above U+00FF, and keeps Latin-1', () => {
    const { headers, rejected } = parseResponseHeaders('X-Wide: cafā\nX-Latin: café')
    expect(headers).toEqual([['X-Latin', 'café']])
    expect(rejected.map((r) => r.line)).toEqual(['X-Wide: cafā'])
  })

  it('never keeps a control character in a value', () => {
    // Stray control characters are stripped by cleanText; a tab inside a value
    // is refused outright, since a header value may not carry one here.
    const { headers, rejected } = parseResponseHeaders('X-Bell: a\u0007b\nX-Tab: a\tb\nX-Ok: fine')
    expect(headers).toEqual([
      ['X-Bell', 'ab'],
      ['X-Ok', 'fine'],
    ])
    expect(rejected.map((r) => r.line)).toEqual(['X-Tab: a\tb'])
  })
})

// --- Blocked paths ----------------------------------------------------------

describe('parseBlockedPaths', () => {
  it('normalises paths, drops duplicates, and refuses the root and protected areas', () => {
    const { paths, rejected } = parseBlockedPaths(
      ['/old-catalogue', '/sale/*', '/', '/admin', '/api/x', '/old-catalogue', '/has space', '/a/../b', '# note'].join('\n'),
    )
    expect(paths).toEqual(['/old-catalogue', '/sale'])
    expect(rejected.map((r) => r.line)).toEqual(['/', '/admin', '/api/x', '/has space', '/a/../b'])
  })
})

describe('isBlockedPath', () => {
  it('matches the path and anything beneath it, on a segment boundary, ignoring case', () => {
    expect(isBlockedPath('/shop/tea', ['/shop'])).toBe(true)
    expect(isBlockedPath('/SHOP', ['/shop'])).toBe(true)
    expect(isBlockedPath('/shop/', ['/shop'])).toBe(true)
    expect(isBlockedPath('/shopping', ['/shop'])).toBe(false)
    expect(isBlockedPath('/', ['/shop'])).toBe(false)
    expect(isBlockedPath('/anything', [])).toBe(false)
  })
})

describe('normaliseRequestPath', () => {
  it('decodes percent-encoding, drops empty and dot segments, and resolves ..', async () => {
    const { normaliseRequestPath } = await import('@/features/security/requestGuard')
    expect(normaliseRequestPath('/old-%63atalogue/item')).toBe('/old-catalogue/item')
    expect(normaliseRequestPath('/old-catalogue%2Fitem')).toBe('/old-catalogue/item')
    expect(normaliseRequestPath('/a//b/./c/../d/')).toBe('/a/b/d')
    expect(normaliseRequestPath('/')).toBe('/')
  })

  it('keeps the raw path when the encoding is malformed, rather than throwing', async () => {
    const { normaliseRequestPath } = await import('@/features/security/requestGuard')
    expect(normaliseRequestPath('/old-catalogue/%E0%A4%A')).toBe('/old-catalogue/%E0%A4%A')
  })
})

// --- Admin card rows --------------------------------------------------------

describe('describeSiteFiles', () => {
  it('reports each file with the state the form values give', () => {
    const rows = describeSiteFiles({ llmsEnabled: false, adsTxt: '', humansTxt: 'Team: us' }, NOW)
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId.llms.state).toBe('off')
    expect(byId['llms-full'].state).toBe('off')
    expect(byId.ads.state).toBe('empty')
    expect(byId.humans.state).toBe('served')
    expect(byId.security.state).toBe('empty')
    expect(byId.manifest.path).toBe('/manifest.webmanifest')
  })
})

// --- Routes, with the engine mocked -----------------------------------------

const seoSettings = (siteFiles: SiteFilesSettings, extra: Record<string, unknown> = {}) => ({ siteFiles, indexing: {}, sitemap: {}, ...extra })

describe('site file routes', () => {
  beforeEach(() => {
    state.seo = seoSettings({
      llmsTitle: 'Grace & Gatsby',
      llmsSummary: 'A boutique.',
      llmsIncludeCollections: ['pages', 'posts'],
      serverBlockedPaths: '/old-catalogue',
    })
    state.site = { siteName: 'Grace & Gatsby', favicon: { url: '/media/fav.png' }, logo: null }
    state.flags = { seo: true, blog: true, ecommerce: true, events: true }
    state.docs = {
      posts: [
        { id: 10, title: 'Open post', slug: 'open', excerpt: 'Public.', content: '<p>Body text.</p>' },
        { id: 11, title: 'Locked post', slug: 'locked', excerpt: 'Secret.', content: '<p>Secret body.</p>' },
      ],
    }
    state.pages = [
      { page: { id: 1, title: 'Home', isHomepage: true, slug: 'home', blocks: [{ heading: 'Welcome' }] }, path: ['home'] },
      { page: { id: 2, title: 'About', slug: 'about', seo: { metaDescription: 'Our story' }, blocks: [] }, path: ['about'] },
      { page: { id: 3, title: 'Hidden', slug: 'hidden', seo: { noIndex: true }, blocks: [] }, path: ['hidden'] },
      { page: { id: 4, title: 'Gated', slug: 'gated', blocks: [] }, path: ['gated'] },
      { page: { id: 5, title: 'Blocked', slug: 'old-catalogue', blocks: [] }, path: ['old-catalogue'] },
    ]
    state.protectedIds = new Set([4, 11])
    state.rules = { headers: [], blockedPaths: ['/old-catalogue'] }
  })

  it('serves llms.txt with the listed pages and posts only', async () => {
    const { GET } = await import('@/app/llms.txt/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toContain('max-age=300')
    const body = await res.text()
    expect(body).toContain('# Grace & Gatsby')
    expect(body).toContain('> A boutique.')
    expect(body).toContain('## Pages')
    expect(body).toContain('- [Home](https://gracengatsby.com/)')
    expect(body).toContain('- [About](https://gracengatsby.com/about): Our story')
    expect(body).toContain('- [Open post](https://gracengatsby.com/blog/open): Public.')
    // Noindex, password-gated and blocked content never appears.
    expect(body).not.toContain('Hidden')
    expect(body).not.toContain('Gated')
    expect(body).not.toContain('Blocked')
    expect(body).not.toContain('Locked post')
    expect(body).not.toContain('## Products')
  })

  it('fails closed: a password lookup that errors keeps every gated document out', async () => {
    state.gateThrows = true
    try {
      const { GET } = await import('@/app/llms.txt/route')
      const body = await (await GET()).text()
      expect(body).not.toContain('- [Home]')
      expect(body).not.toContain('Open post')
      // Every lookup failed, so nothing that depends on one is listed.
      expect(body).not.toContain('- [About]')
    } finally {
      state.gateThrows = false
    }
  })

  it('reads the protected ids once per collection, not once per document', async () => {
    state.dbCalls = 0
    const { GET } = await import('@/app/llms.txt/route')
    await GET()
    // Pages and posts are the default collections: two queries, whatever the item count.
    expect(state.dbCalls).toBe(2)
  })

  it('leaves noindex products and events out of llms.txt, as it does for pages', async () => {
    state.seo = seoSettings({ llmsIncludeCollections: ['products', 'events'] })
    state.docs = {
      products: [
        { id: 20, title: 'Teapot hidden', slug: 'teapot', excerpt: 'Secret.', seo: { noIndex: true } },
        { id: 21, title: 'Kettle', slug: 'kettle', excerpt: 'Shiny.', seo: { noIndex: false } },
      ],
      events: [{ id: 30, title: 'Tasting hidden', slug: 'tasting', excerpt: 'Evening.', seo: { noIndex: true } }],
    }
    const { GET } = await import('@/app/llms.txt/route')
    const body = await (await GET()).text()
    expect(body).toContain('- [Kettle](https://gracengatsby.com/shop/kettle): Shiny.')
    expect(body).not.toContain('Teapot')
    expect(body).not.toContain('Tasting')
  })

  it('llms-full.txt includes the page text and not the markup', async () => {
    const { GET } = await import('@/app/llms-full.txt/route')
    const body = await (await GET()).text()
    expect(body).toContain('### Open post')
    expect(body).toContain('Body text.')
    expect(body).not.toContain('<p>')
    expect(body).toContain('Welcome')
  })

  it('answers 404 for llms.txt when it is switched off', async () => {
    state.seo = seoSettings({ llmsEnabled: false })
    const { GET } = await import('@/app/llms.txt/route')
    expect((await GET()).status).toBe(404)
  })

  it('answers 404 for every site file when the SEO feature is off', async () => {
    state.flags = { ...state.flags, seo: false }
    const llms = await import('@/app/llms.txt/route')
    const manifest = await import('@/app/manifest.webmanifest/route')
    expect((await llms.GET()).status).toBe(404)
    expect((await manifest.GET()).status).toBe(404)
  })

  it('answers 404 for security.txt until a contact and a future expiry are set', async () => {
    state.seo = seoSettings({ securityTxtContact: 'security@gracengatsby.com', securityTxtExpires: '2020-01-01' })
    const { GET } = await import('@/app/.well-known/security.txt/route')
    expect((await GET()).status).toBe(404)
  })

  it('serves security.txt when it is valid', async () => {
    state.seo = seoSettings({ securityTxtContact: 'security@gracengatsby.com', securityTxtExpires: '2099-12-31' })
    const { GET } = await import('@/app/.well-known/security.txt/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Contact: mailto:security@gracengatsby.com')
  })

  it('serves ads.txt, app-ads.txt and humans.txt, and 404s when blank', async () => {
    state.seo = seoSettings({ adsTxt: 'google.com, pub-1, DIRECT', appAdsTxt: '', humansTxt: 'Built by us' })
    const ads = await import('@/app/ads.txt/route')
    const app = await import('@/app/app-ads.txt/route')
    const humans = await import('@/app/humans.txt/route')
    expect(await (await ads.GET()).text()).toBe('google.com, pub-1, DIRECT\n')
    expect((await app.GET()).status).toBe(404)
    expect(await (await humans.GET()).text()).toBe('Built by us\n')
  })

  it('serves the manifest as JSON with the manifest content type, using the site name and icons', async () => {
    state.seo = seoSettings({ manifestThemeColor: '#1f2230', manifestDisplay: 'minimal-ui' })
    state.site = { siteName: 'Grace & Gatsby', favicon: { url: '/media/fav.png' }, logo: { url: '/media/logo.png' } }
    const { GET } = await import('@/app/manifest.webmanifest/route')
    const res = await GET()
    expect(res.headers.get('content-type')).toBe('application/manifest+json; charset=utf-8')
    const manifest = JSON.parse(await res.text())
    expect(manifest.name).toBe('Grace & Gatsby')
    expect(manifest.display).toBe('minimal-ui')
    expect(manifest.theme_color).toBe('#1f2230')
    expect(manifest.icons).toHaveLength(2)
  })

  it('redirects /favicon.ico to the configured favicon, and 404s without one', async () => {
    const { GET } = await import('@/app/favicon.ico/route')
    const res = await GET()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/media/fav.png')

    state.site = { siteName: 'Site', favicon: null }
    expect((await GET()).status).toBe(404)
  })
})

// --- Middleware passthrough -------------------------------------------------

describe('security middleware and site files', () => {
  const request = (path: string) => new NextRequest(new URL(`https://gracengatsby.com${path}`))

  beforeEach(() => {
    state.rules = { headers: [], blockedPaths: [] }
  })

  it.each(['/llms.txt', '/llms-full.txt', '/.well-known/security.txt', '/ads.txt', '/app-ads.txt', '/humans.txt', '/manifest.webmanifest', '/favicon.ico'])(
    'does not block or redirect %s',
    async (path) => {
      const { securityMiddleware } = await import('@/features/security/requestGuard')
      const res = await securityMiddleware(request(path))
      expect(res.headers.get('x-middleware-next')).toBe('1')
      expect(res.headers.get('location')).toBeNull()
      expect(res.status).toBe(200)
    },
  )

  it('still redirects an ordinary page, so the test above proves something', async () => {
    const { securityMiddleware } = await import('@/features/security/requestGuard')
    const res = await securityMiddleware(request('/about'))
    expect(res.status).toBe(301)
  })

  it('answers blocked paths with 404, but never the admin area', async () => {
    state.rules = { headers: [], blockedPaths: ['/old-catalogue'] }
    const { securityMiddleware } = await import('@/features/security/requestGuard')
    expect((await securityMiddleware(request('/old-catalogue/item'))).status).toBe(404)
    expect((await securityMiddleware(request('/old-catalogue'))).status).toBe(404)
    expect((await securityMiddleware(request('/old-cataloguer'))).status).toBe(301)
  })

  it('matches blocked paths however they are written: case, double slashes, encoding, trailing slash', async () => {
    state.rules = { headers: [], blockedPaths: ['/old-catalogue'] }
    const { securityMiddleware } = await import('@/features/security/requestGuard')
    for (const path of ['/OLD-CATALOGUE/', '/old-catalogue//item', '/old-%63atalogue', '/old-catalogue%2Fitem', '/old-catalogue/']) {
      expect((await securityMiddleware(request(path))).status, path).toBe(404)
    }
  })

  it('never answers 500 for a malformed percent-encoding', async () => {
    state.rules = { headers: [], blockedPaths: ['/old-catalogue'] }
    const { securityMiddleware } = await import('@/features/security/requestGuard')
    expect((await securityMiddleware(request('/about/%E0%A4%A'))).status).not.toBe(500)
    expect((await securityMiddleware(request('/old-catalogue/%E0%A4%A'))).status).toBe(404)
  })

  it('skips a response header the runtime refuses and still applies the rest', async () => {
    const { applyServerResponseHeaders } = await import('@/features/security/requestGuard')
    const { NextResponse } = await import('next/server')
    const rules = { headers: [['X-Bad', 'snow☃'], ['X-Good', 'yes']] as [string, string][], blockedPaths: [] as string[] }
    const response = applyServerResponseHeaders(new NextResponse('ok'), rules, '/about')
    expect(response.headers.get('x-bad')).toBeNull()
    expect(response.headers.get('x-good')).toBe('yes')
  })

  it('adds the configured response headers to public pages but not to the admin area', async () => {
    state.rules = { headers: [['X-Robots-Tag', 'noarchive']], blockedPaths: [] }
    const { securityMiddleware } = await import('@/features/security/requestGuard')
    const res = await securityMiddleware(request('/humans.txt'))
    expect(res.headers.get('x-robots-tag')).toBe('noarchive')
    const admin = await securityMiddleware(request('/admin/pages'))
    expect(admin.headers.get('x-robots-tag')).toBeNull()
  })
})

// --- Server rules cache -----------------------------------------------------

describe('readServerRules cache', () => {
  const T0 = Date.parse('2026-10-10T00:00:00.000Z')
  let now = T0
  let readServerRules: () => Promise<{ headers: [string, string][]; blockedPaths: string[] }>
  let invalidateServerRulesCache: () => void

  beforeEach(async () => {
    now = T0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const actual = await vi.importActual<typeof import('@/features/seo/serverRules')>('@/features/seo/serverRules')
    readServerRules = actual.readServerRules
    invalidateServerRulesCache = actual.invalidateServerRulesCache
    invalidateServerRulesCache()
    state.d1 = { row: { headers: 'X-A: one', blocked: null }, fail: false, calls: 0 }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    state.d1 = null
  })

  it('keeps the previous rules when a read fails, and retries after ten seconds', async () => {
    expect((await readServerRules()).headers).toEqual([['X-A', 'one']])
    expect(state.d1!.calls).toBe(1)

    // A minute on, the cache is due; the read fails. The last good rules stay.
    now = T0 + 61_000
    state.d1!.fail = true
    expect((await readServerRules()).headers).toEqual([['X-A', 'one']])
    expect(state.d1!.calls).toBe(2)

    // Within the retry window the failure is not read again.
    now = T0 + 65_000
    expect((await readServerRules()).headers).toEqual([['X-A', 'one']])
    expect(state.d1!.calls).toBe(2)

    // Ten seconds after the failure it tries again, and picks up the new row.
    now = T0 + 72_000
    state.d1 = { row: { headers: 'X-A: two', blocked: null }, fail: false, calls: state.d1!.calls }
    expect((await readServerRules()).headers).toEqual([['X-A', 'two']])
    expect(state.d1.calls).toBe(3)
  })

  it('caches the empty rules for ten seconds, not a minute, when there was nothing to keep', async () => {
    state.d1!.fail = true
    expect((await readServerRules()).headers).toEqual([])
    expect(state.d1!.calls).toBe(1)

    now = T0 + 5_000
    expect((await readServerRules()).headers).toEqual([])
    expect(state.d1!.calls).toBe(1)

    now = T0 + 11_000
    state.d1!.fail = false
    expect((await readServerRules()).headers).toEqual([['X-A', 'one']])
    expect(state.d1!.calls).toBe(2)
  })
})
