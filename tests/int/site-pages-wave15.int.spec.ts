// @vitest-environment node
// Site pages and maintenance mode (site-pages global): pure rules, no database.
import { describe, expect, it } from 'vitest'

import {
  BYPASS_COOKIE,
  bypassLinkPath,
  type MaintenanceInput,
  isBypassed,
  isBypassPath,
  isExcludedPath,
  isValidBypassToken,
  maintenanceTokenBeforeChange,
  shouldShowMaintenance,
} from '@/features/site/maintenance'
import { DEFAULT_MAINTENANCE_HEADLINE, normaliseSitePages, pathForPage, relationId } from '@/features/site/pagesShape'

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2'
const OTHER = 'ffffffffffffffffffffffff'

const base: MaintenanceInput = { enabled: true, path: '/shop', cookie: null, token: TOKEN, isAdmin: false, allowAdmins: true }

describe('maintenance rules', () => {
  it('shows the screen to an ordinary visitor when maintenance is on', () => {
    expect(shouldShowMaintenance(base)).toBe(true)
  })

  it('shows the real site when maintenance is off', () => {
    expect(shouldShowMaintenance({ ...base, enabled: false })).toBe(false)
  })

  it('lets a visitor with the matching bypass cookie through, but not a wrong one', () => {
    expect(shouldShowMaintenance({ ...base, cookie: TOKEN })).toBe(false)
    expect(shouldShowMaintenance({ ...base, cookie: OTHER })).toBe(true)
    expect(shouldShowMaintenance({ ...base, cookie: null })).toBe(true)
  })

  it('never lets a missing or malformed stored token match', () => {
    expect(isBypassed({ cookie: '', token: '', isAdmin: false, allowAdmins: false })).toBe(false)
    expect(isBypassed({ cookie: 'x', token: 'x', isAdmin: false, allowAdmins: false })).toBe(false)
    expect(isBypassed({ cookie: undefined, token: null, isAdmin: false, allowAdmins: false })).toBe(false)
  })

  it('lets signed-in admins through only when allowAdmins is on', () => {
    expect(shouldShowMaintenance({ ...base, isAdmin: true, allowAdmins: true })).toBe(false)
    expect(shouldShowMaintenance({ ...base, isAdmin: true, allowAdmins: false })).toBe(true)
  })

  it('never covers admin, API (webhooks included), feeds, files or the bypass link', () => {
    for (const path of ['/admin', '/admin/content/pages', '/api/shop-stripe-webhook', '/feeds/google-merchant.xml', '/robots.txt', '/sitemap.xml', '/indexnow-key.txt']) {
      expect(isExcludedPath(path)).toBe(true)
      expect(shouldShowMaintenance({ ...base, path })).toBe(false)
    }
    expect(shouldShowMaintenance({ ...base, path: bypassLinkPath(TOKEN) })).toBe(false)
  })

  it('does not treat similar-looking paths as excluded', () => {
    expect(isExcludedPath('/administrators')).toBe(false)
    expect(isExcludedPath('/apiary')).toBe(false)
    expect(isExcludedPath('/shop/admin-kit')).toBe(false)
    expect(shouldShowMaintenance({ ...base, path: '/administrators' })).toBe(true)
  })

  it('ignores the query string when checking excluded paths', () => {
    expect(isExcludedPath('/admin?tab=1')).toBe(true)
    expect(isExcludedPath('/shop?ref=admin')).toBe(false)
  })

  it('recognises bypass links and valid tokens', () => {
    expect(isBypassPath(bypassLinkPath(TOKEN))).toBe(true)
    expect(isBypassPath('/shop')).toBe(false)
    expect(isValidBypassToken(TOKEN)).toBe(true)
    expect(isValidBypassToken('ABCDEF0123456789ABCDEF01')).toBe(false)
    expect(isValidBypassToken('short')).toBe(false)
    expect(BYPASS_COOKIE).toBe('maint_bypass')
  })
})

describe('maintenance token hook', () => {
  it('creates a 24-character hex token when maintenance is switched on and none exists', () => {
    const data = { maintenance: { enabled: true, bypassToken: null as string | null } }
    const out = maintenanceTokenBeforeChange({ data, originalDoc: null })
    expect(out?.maintenance?.bypassToken).toMatch(/^[a-f0-9]{24}$/)
  })

  it('keeps the stored token so the shared link keeps working', () => {
    const data = { maintenance: { enabled: true, bypassToken: 'client-supplied' } }
    const out = maintenanceTokenBeforeChange({ data, originalDoc: { maintenance: { enabled: false, bypassToken: TOKEN } } })
    expect(out?.maintenance?.bypassToken).toBe(TOKEN)
  })

  it('ignores a token sent by the client', () => {
    const data = { maintenance: { enabled: true, bypassToken: OTHER } }
    const out = maintenanceTokenBeforeChange({ data, originalDoc: { maintenance: { bypassToken: TOKEN } } })
    expect(out?.maintenance?.bypassToken).not.toBe(OTHER)
    expect(out?.maintenance?.bypassToken).toBe(TOKEN)
  })

  it('clears the token when maintenance is off and no valid token is stored', () => {
    const data = { maintenance: { enabled: false, bypassToken: 'nope' } }
    expect(maintenanceTokenBeforeChange({ data, originalDoc: null })?.maintenance?.bypassToken).toBeNull()
  })

  it('returns the data untouched when there is no maintenance group', () => {
    const data = { notFoundPage: 3 } as { maintenance?: null }
    expect(maintenanceTokenBeforeChange({ data, originalDoc: null })).toBe(data)
  })
})

describe('site pages shape', () => {
  it('applies the defaults when nothing is saved', () => {
    const config = normaliseSitePages(null)
    expect(config).toEqual({
      notFoundPageId: null,
      privacyPolicyPageId: null,
      termsPageId: null,
      maintenance: { enabled: false, headline: DEFAULT_MAINTENANCE_HEADLINE, message: '', bypassToken: null, allowAdmins: true },
    })
    expect(DEFAULT_MAINTENANCE_HEADLINE).toBe("We'll be back soon")
  })

  it('reads relationship ids in every shape they can arrive in', () => {
    expect(relationId(12)).toBe(12)
    expect(relationId('12')).toBe(12)
    expect(relationId({ id: 9, title: 'Populated' })).toBe(9)
    expect(relationId(0)).toBeNull()
    expect(relationId('abc')).toBeNull()
    expect(relationId(undefined)).toBeNull()
  })

  it('treats a blank headline as the default and trims the message', () => {
    const config = normaliseSitePages({ maintenance: { enabled: true, headline: '   ', message: '  Back at noon.  ', allowAdmins: false } })
    expect(config.maintenance.enabled).toBe(true)
    expect(config.maintenance.headline).toBe(DEFAULT_MAINTENANCE_HEADLINE)
    expect(config.maintenance.message).toBe('Back at noon.')
    expect(config.maintenance.allowAdmins).toBe(false)
  })

  it('drops a stored token that is not 24 lowercase hex characters', () => {
    expect(normaliseSitePages({ maintenance: { bypassToken: 'not-a-token' } }).maintenance.bypassToken).toBeNull()
    expect(normaliseSitePages({ maintenance: { bypassToken: TOKEN } }).maintenance.bypassToken).toBe(TOKEN)
  })

  it('maps a picked page to its public path, the homepage to "/", and unknown pages to null', () => {
    const entries = [
      { page: { id: 1, isHomepage: true }, path: ['home'] },
      { page: { id: 2 }, path: ['privacy'] },
      { page: { id: 3 }, path: ['about', 'team'] },
    ]
    expect(pathForPage(1, entries)).toBe('/')
    expect(pathForPage(2, entries)).toBe('/privacy')
    expect(pathForPage(3, entries)).toBe('/about/team')
    expect(pathForPage(99, entries)).toBeNull()
    expect(pathForPage(null, entries)).toBeNull()
  })
})
