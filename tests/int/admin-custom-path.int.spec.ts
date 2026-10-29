// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

import {
  DEFAULT_ADMIN_PATH,
  RESERVED_ADMIN_PATHS,
  adminHref,
  isUnderAdminRoot,
  normaliseAdminPath,
  rebaseAdminPath,
  resolveAdminRoot,
  validateAdminPath,
} from '@/features/security/adminPath'
import { validateAdminPathField } from '@/features/security/adminPathValidate'

const state = vi.hoisted(() => ({
  adminPath: '/admin' as string,
  seen: [] as string[],
  redirectTo: null as string | null,
}))

vi.mock('@/features/security', () => ({
  readSecuritySettingsFromD1: async () => ({ adminPath: state.adminPath }),
  securityMiddleware: async (request: NextRequest) => {
    state.seen.push(request.nextUrl.pathname)
    if (state.redirectTo) return NextResponse.redirect(new URL(state.redirectTo, request.url))
    return NextResponse.next()
  },
}))
vi.mock('@/features/multilingual/middleware', () => ({
  multilingualMiddleware: async (request: NextRequest, handle: (r: NextRequest) => Promise<NextResponse>) => handle(request),
}))

import { middleware } from '@/middleware'

const get = (path: string) => middleware(new NextRequest(`https://site.test${path}`))

describe('admin path validation', () => {
  it.each(['/studio-7f3', 'studio-7f3', '/ops', '/a-b-c', '/abc123', '/' + 'a'.repeat(40)])('accepts %s', (value) => {
    expect(validateAdminPath(value)).toBeNull()
    expect(validateAdminPathField(value)).toBe(true)
  })

  it.each([
    ['/Studio', 'format'],
    ['/studio_7', 'format'],
    ['/studio/7', 'format'],
    ['/studio 7', 'format'],
    ['/ü', 'format'],
    ['/ab', 'length'],
    ['/' + 'a'.repeat(41), 'length'],
    ['/api', 'reserved'],
    ['/shop', 'reserved'],
    ['/blog', 'reserved'],
    ['/cart', 'reserved'],
    ['/checkout', 'reserved'],
    ['/preview', 'reserved'],
    ['/login', 'reserved'],
    ['/_next', 'format'],
  ])('rejects %s as %s', (value, reason) => {
    expect(validateAdminPath(value)).toBe(reason)
    expect(typeof validateAdminPathField(value)).toBe('string')
  })

  it('treats an empty value as the default, not as an error in the field', () => {
    expect(validateAdminPathField('')).toBe(true)
    expect(normaliseAdminPath('  /Studio/ ')).toBe('/Studio')
  })

  it('reserves every listed word', () => {
    for (const word of RESERVED_ADMIN_PATHS) {
      if (word.startsWith('_') || word.startsWith('.')) continue
      expect(validateAdminPath(`/${word}`), word).toBe('reserved')
    }
  })
})

describe('admin path resolution', () => {
  it('uses /admin when nothing is set', () => {
    expect(resolveAdminRoot(undefined, undefined)).toBe(DEFAULT_ADMIN_PATH)
    expect(resolveAdminRoot('', '')).toBe('/admin')
  })

  it('uses the saved setting when no env override is set', () => {
    expect(resolveAdminRoot('/studio-7f3', undefined)).toBe('/studio-7f3')
  })

  it('lets ENGAGE_ADMIN_PATH win over the setting', () => {
    expect(resolveAdminRoot('/studio-7f3', '/recovery-1')).toBe('/recovery-1')
  })

  it('skips an invalid env override and falls back to the setting, then /admin', () => {
    expect(resolveAdminRoot('/studio-7f3', '/api')).toBe('/studio-7f3')
    expect(resolveAdminRoot('/bad_path', '/x')).toBe('/admin')
  })

  it('builds and recognises paths under the root', () => {
    expect(adminHref('/login', '/studio-7f3')).toBe('/studio-7f3/login')
    expect(adminHref('', '/studio-7f3')).toBe('/studio-7f3')
    expect(adminHref('/login')).toBe('/admin/login')
    expect(isUnderAdminRoot('/studio-7f3/x', '/studio-7f3')).toBe(true)
    expect(isUnderAdminRoot('/studio-7f3x', '/studio-7f3')).toBe(false)
    expect(rebaseAdminPath('/admin/content/pages', '/studio-7f3')).toBe('/studio-7f3/content/pages')
    expect(rebaseAdminPath('/shop', '/studio-7f3')).toBe('/shop')
  })
})

describe('middleware serves the configured admin URL', () => {
  beforeEach(() => {
    state.seen = []
    state.redirectTo = null
    state.adminPath = '/studio-7f3'
    delete process.env.ENGAGE_ADMIN_PATH
  })
  afterEach(() => {
    delete process.env.ENGAGE_ADMIN_PATH
  })

  it('rewrites the custom path to /admin and runs the pipeline on the /admin path', async () => {
    const response = await get('/studio-7f3/content/pages')
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://site.test/admin/content/pages')
    expect(state.seen).toEqual(['/admin/content/pages'])
  })

  it('answers the old /admin with 404', async () => {
    const response = await get('/admin/login')
    expect(response.status).toBe(404)
    expect(state.seen).toEqual([])
  })

  it('moves a redirect into /admin onto the custom path', async () => {
    state.redirectTo = '/admin/login'
    const response = await get('/studio-7f3/content')
    expect(response.headers.get('location')).toBe('https://site.test/studio-7f3/login')
  })

  it('ENGAGE_ADMIN_PATH serves the admin even when the setting says something else', async () => {
    process.env.ENGAGE_ADMIN_PATH = '/recovery-1'
    const response = await get('/recovery-1/')
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://site.test/admin/')
    const old = await get('/studio-7f3/')
    expect(old.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('leaves a public page alone and keeps /admin when the default is set', async () => {
    state.adminPath = '/admin'
    const response = await get('/admin/login')
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.status).toBe(200)
    expect(state.seen).toEqual(['/admin/login'])
  })

  it('keeps noindex on the custom admin', async () => {
    const response = await get('/studio-7f3/content')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive')
  })
})
