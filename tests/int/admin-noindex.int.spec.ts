// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

import { NOINDEX_HEADER_VALUE, isNoindexPath } from '@/features/security/noindex'

const state = vi.hoisted(() => ({
  ctx: { enabled: true, settings: null as Record<string, unknown> | null, siteName: 'Site', baseUrl: 'https://site.test' } as Record<string, unknown>,
}))

vi.mock('@/features/seo/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/seo/settings')>()
  return { ...actual, getSeoContext: async () => state.ctx }
})
vi.mock('@/features/multilingual/middleware', () => ({
  multilingualMiddleware: async (request: NextRequest, handle: (r: NextRequest) => Promise<NextResponse>) => handle(request),
}))
vi.mock('@/features/security', () => ({
  securityMiddleware: async () => NextResponse.next(),
  readSecuritySettingsFromD1: async () => ({ adminPath: '/admin' }),
}))

import { middleware } from '@/middleware'
import { buildRobotsTxt } from '@/features/seo/robots'

describe('isNoindexPath', () => {
  it.each(['/admin', '/admin/', '/admin/content/pages', '/api', '/api/admin-bulk', '/login', '/preview/pages/1', '/preview'])(
    'treats %s as non-public',
    (path) => expect(isNoindexPath(path)).toBe(true),
  )

  it.each(['/', '/about', '/administrators', '/apiary', '/loginhelp', '/blog/admin-tips', '/previews-news'])(
    'leaves %s indexable',
    (path) => expect(isNoindexPath(path)).toBe(false),
  )

  it('honours a configured admin root as well as /admin', () => {
    expect(isNoindexPath('/studio-7f3/content', '/studio-7f3')).toBe(true)
    expect(isNoindexPath('/studio-7f3', '/admin')).toBe(false)
  })
})

describe('middleware X-Robots-Tag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['/admin', '/admin/login', '/api/admin-bulk', '/preview/pages/3'])('sends noindex on %s', async (path) => {
    const response = await middleware(new NextRequest(`https://site.test${path}`))
    expect(response.headers.get('X-Robots-Tag')).toBe(NOINDEX_HEADER_VALUE)
  })

  it('leaves public pages without the header', async () => {
    const response = await middleware(new NextRequest('https://site.test/about'))
    expect(response.headers.get('X-Robots-Tag')).toBeNull()
  })
})

describe('buildRobotsTxt admin and API rules', () => {
  beforeEach(() => {
    state.ctx = { enabled: true, settings: null, siteName: 'Site', baseUrl: 'https://site.test' }
  })

  it('disallows the admin and API in the generated file', async () => {
    const text = (await buildRobotsTxt()) ?? ''
    expect(text).toContain('Disallow: /admin')
    expect(text).toContain('Disallow: /api')
    expect(text).toContain('Sitemap: https://site.test/sitemap.xml')
  })

  it('keeps a custom file verbatim and appends only the missing admin/API rules', async () => {
    const custom = 'User-agent: *\nDisallow: /private\nDisallow: /api\n# editor note'
    state.ctx = {
      ...state.ctx,
      settings: { indexing: { customRobotsTxt: custom }, sitemap: { enabled: true } },
    }
    const text = (await buildRobotsTxt()) ?? ''
    expect(text.startsWith(`${custom}\n`)).toBe(true)
    expect(text.match(/Disallow: \/api/g)).toHaveLength(1)
    expect(text).toContain('User-agent: *\nDisallow: /admin')
    expect(text).toContain('Sitemap: https://site.test/sitemap.xml')
  })

  it('does not append anything when a custom file already has every required rule and a sitemap', async () => {
    const custom = 'User-agent: *\nDisallow: /admin\nDisallow: /api\nSitemap: https://site.test/sitemap.xml'
    state.ctx = { ...state.ctx, settings: { indexing: { customRobotsTxt: custom }, sitemap: { enabled: true } } }
    expect(await buildRobotsTxt()).toBe(`${custom}\n`)
  })

  it('disallows the configured admin root', async () => {
    const text = (await buildRobotsTxt('/studio-7f3')) ?? ''
    expect(text).toContain('Disallow: /studio-7f3')
  })
})
