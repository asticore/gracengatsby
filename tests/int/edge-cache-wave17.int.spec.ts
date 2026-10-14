import { describe, expect, it } from 'vitest'

import {
  cacheKeyFor,
  clampTtl,
  isCacheableRequest,
  isCacheableResponse,
  isMobileUserAgent,
  isNeverCacheSegment,
  isStrippedQueryParam,
  matchesNeverCache,
  matchesRule,
  parseCookieNames,
  parseRuleLines,
  requestVerdict,
  type EdgeRules,
} from '@/features/speed/edgeCache'

const RULES: EdgeRules = {
  cacheLoggedInUsers: false,
  neverCachePaths: [],
  neverCacheCookies: [],
  neverCacheQueryStrings: [],
}

const rules = (patch: Partial<EdgeRules>): EdgeRules => ({ ...RULES, ...patch })

/** A minimal Headers-like object; lookups are case-insensitive, like the real thing. */
const headers = (init: Record<string, string> = {}) => ({
  get: (name: string): string | null => {
    const key = Object.keys(init).find((k) => k.toLowerCase() === name.toLowerCase())
    return key === undefined ? null : init[key]
  },
})

const BASE = 'https://example.com'

describe('parseRuleLines', () => {
  it.each([
    ['null input', null, []],
    ['empty string', '', []],
    ['trims and drops blank lines', '  /a  \n\n   \n/b', ['/a', '/b']],
    ['drops # comment lines', '# note\n/a\n  # indented note\n/b', ['/a', '/b']],
    ['removes duplicates, keeps first', '/a\n/b\n/a', ['/a', '/b']],
    ['handles CRLF line endings', '/a\r\n/b\r\n', ['/a', '/b']],
  ])('%s', (_name, input, expected) => {
    expect(parseRuleLines(input as string | null)).toEqual(expected)
  })

  it('caps the list at 200 rules', () => {
    const text = Array.from({ length: 250 }, (_, i) => `/p${i}`).join('\n')
    expect(parseRuleLines(text)).toHaveLength(200)
  })

  it('clips a line at 200 characters', () => {
    const long = 'x'.repeat(300)
    expect(parseRuleLines(long)[0]).toHaveLength(200)
  })
})

describe('matchesRule (cookie and query names)', () => {
  it.each([
    ['exact name', 'wordpress_logged_in', 'wordpress_logged_in', true],
    ['exact name is not a prefix', 'wordpress_logged_in_2', 'wordpress_logged_in', false],
    ['trailing * is a prefix', 'wp_woocommerce_session', 'wp_woocommerce*', true],
    ['prefix does not match the wrong start', 'xwp_woo', 'wp_woo*', false],
    ['empty rule matches nothing', 'anything', '   ', false],
    ['bare * matches everything', 'anything', '*', true],
  ])('%s', (_name, value, rule, expected) => {
    expect(matchesRule(value, rule)).toBe(expected)
  })
})

describe('matchesNeverCache (path rules)', () => {
  it.each([
    ['exact path', '/about', ['/about'], true],
    ['exact path ignores trailing slash', '/about/', ['/about'], true],
    ['rule trailing slash ignored', '/about', ['/about/'], true],
    ['rule without leading slash', '/about', ['about'], true],
    ['different path', '/contact', ['/about'], false],
    ['star matches everything below', '/shop/item-1', ['/shop/*'], true],
    ['star does not match a sibling by mistake', '/store', ['/shop/*'], false],
    ['root exact', '/', ['/'], true],
    ['no rules', '/about', [], false],
    ['blank rule ignored', '/about', ['  '], false],
  ])('%s', (_name, path, patterns, expected) => {
    expect(matchesNeverCache(path, patterns)).toBe(expected)
  })
})

describe('isNeverCacheSegment (built-in paths)', () => {
  it.each([
    ['/admin', true],
    ['/admin/settings', true],
    ['/administrator', false],
    ['/api/thing', true],
    ['/_next/static/app.js', true],
    ['/cart', true],
    ['/checkout/step-2', true],
    ['/account/orders', true],
    ['/login/', true],
    ['/maintenance-bypass', true],
    ['/products', false],
    ['/', false],
  ])('%s -> %s', (path, expected) => {
    expect(isNeverCacheSegment(path)).toBe(expected)
  })
})

describe('parseCookieNames', () => {
  it('returns [] for no header', () => {
    expect(parseCookieNames(null)).toEqual([])
    expect(parseCookieNames('')).toEqual([])
  })

  it('reads names in order and never looks at values', () => {
    expect(parseCookieNames('a=1; b=2')).toEqual(['a', 'b'])
    expect(parseCookieNames('x=a=b')).toEqual(['x'])
  })

  it('keeps a name that has no value', () => {
    expect(parseCookieNames('engage_consent')).toEqual(['engage_consent'])
  })
})

describe('isStrippedQueryParam', () => {
  it.each([
    ['utm_source', true],
    ['UTM_Medium', true],
    ['fbclid', true],
    ['gclid', true],
    ['page', false],
    ['utmx', false],
    ['s', false],
  ])('%s -> %s', (name, expected) => {
    expect(isStrippedQueryParam(name)).toBe(expected)
  })
})

describe('requestVerdict (what may be cached)', () => {
  it.each([
    ['plain GET, no cookies', `${BASE}/about`, 'GET', {}, RULES, 'ok'],
    ['HEAD is allowed', `${BASE}/about`, 'HEAD', {}, RULES, 'ok'],
    ['POST is never cached', `${BASE}/about`, 'POST', {}, RULES, 'method'],
    ['PUT is never cached', `${BASE}/about`, 'PUT', {}, RULES, 'method'],
    ['unparseable URL', 'not a url', 'GET', {}, RULES, 'url'],
    ['authorization header', `${BASE}/about`, 'GET', { Authorization: 'Bearer x' }, RULES, 'auth'],
    ['range request', `${BASE}/about`, 'GET', { Range: 'bytes=0-10' }, RULES, 'range'],
    ['admin path', `${BASE}/admin/pages`, 'GET', {}, RULES, 'path'],
    ['api path', `${BASE}/api/forms`, 'GET', {}, RULES, 'path'],
    ['cart path', `${BASE}/cart`, 'GET', {}, RULES, 'path'],
    ['checkout path', `${BASE}/checkout`, 'GET', {}, RULES, 'path'],
    ['login with trailing slash', `${BASE}/login/`, 'GET', {}, RULES, 'path'],
    ['never-cache path rule', `${BASE}/shop/item`, 'GET', {}, rules({ neverCachePaths: ['/shop/*'] }), 'never-path'],
    ['query string makes it uncacheable', `${BASE}/blog?page=2`, 'GET', {}, RULES, 'query'],
    ['utm_source is stripped, so cacheable', `${BASE}/blog?utm_source=news`, 'GET', {}, RULES, 'ok'],
    ['fbclid is stripped, so cacheable', `${BASE}/blog?fbclid=abc`, 'GET', {}, RULES, 'ok'],
    ['gclid with utm is cacheable', `${BASE}/?gclid=1&utm_medium=cpc`, 'GET', {}, RULES, 'ok'],
    ['mixed utm and page is not', `${BASE}/?utm_source=a&page=2`, 'GET', {}, RULES, 'query'],
    ['never-query rule beats the strip list', `${BASE}/?utm_source=a`, 'GET', {}, rules({ neverCacheQueryStrings: ['utm_source'] }), 'never-query'],
    ['never-query rule (search term s)', `${BASE}/?s=shoes`, 'GET', {}, rules({ neverCacheQueryStrings: ['s'] }), 'never-query'],
    ['never-query rule ignores case', `${BASE}/?S=shoes`, 'GET', {}, rules({ neverCacheQueryStrings: ['s'] }), 'never-query'],
    ['engage-token means signed in', `${BASE}/about`, 'GET', { Cookie: 'engage-token=abc' }, RULES, 'signed-in'],
    ['engage-token with logged-in on still bypasses', `${BASE}/about`, 'GET', { Cookie: 'engage-token=abc' }, rules({ cacheLoggedInUsers: true }), 'signed-in'],
    ['unlock cookie', `${BASE}/private`, 'GET', { Cookie: 'eg_unlock_page=1' }, RULES, 'unlock'],
    ['unlock cookie on HEAD', `${BASE}/private`, 'HEAD', { Cookie: 'eg_unlock_page=1' }, RULES, 'unlock'],
    ['consent cookie only is harmless', `${BASE}/about`, 'GET', { Cookie: 'engage_consent=yes' }, RULES, 'ok'],
    ['analytics cookie blocks when logged-in off', `${BASE}/about`, 'GET', { Cookie: '_ga=GA1.2.3' }, RULES, 'cookie'],
    ['analytics cookie allowed when logged-in on', `${BASE}/about`, 'GET', { Cookie: '_ga=GA1.2.3' }, rules({ cacheLoggedInUsers: true }), 'ok'],
    ['consent plus another cookie blocks', `${BASE}/about`, 'GET', { Cookie: 'engage_consent=yes; _ga=1' }, RULES, 'cookie'],
    ['never-cache cookie name', `${BASE}/about`, 'GET', { Cookie: 'wordpress_logged_in=x' }, rules({ neverCacheCookies: ['wordpress_logged_in'] }), 'never-cookie'],
    ['never-cache cookie wins with logged-in on', `${BASE}/about`, 'GET', { Cookie: 'wordpress_logged_in=x' }, rules({ cacheLoggedInUsers: true, neverCacheCookies: ['wordpress_logged_in'] }), 'never-cookie'],
    ['never-cache cookie prefix', `${BASE}/about`, 'GET', { Cookie: 'wp_woocommerce_session_1=x' }, rules({ cacheLoggedInUsers: true, neverCacheCookies: ['wp_woocommerce*'] }), 'never-cookie'],
    ['Authorization is matched case-insensitively', `${BASE}/about`, 'GET', { authorization: 'Basic x' }, RULES, 'auth'],
    ['Cookie header name is case-insensitive', `${BASE}/about`, 'GET', { COOKIE: 'engage-token=1' }, RULES, 'signed-in'],
  ])('%s', (_name, url, method, hdrs, ruleSet, reason) => {
    const verdict = requestVerdict(url as string, method as string, headers(hdrs as Record<string, string>), ruleSet as EdgeRules)
    expect(verdict.reason).toBe(reason)
    expect(verdict.cacheable).toBe(reason === 'ok')
  })

  it('isCacheableRequest mirrors the verdict', () => {
    expect(isCacheableRequest(`${BASE}/about`, headers(), 'GET', RULES)).toBe(true)
    expect(isCacheableRequest(`${BASE}/cart`, headers(), 'GET', RULES)).toBe(false)
  })
})

describe('cacheKeyFor', () => {
  it('builds origin + path + version and drops the query string', () => {
    expect(cacheKeyFor(`${BASE}/about?utm_source=x`, 7, false)).toBe(`${BASE}/about?v=7`)
  })

  it('drops the hash', () => {
    expect(cacheKeyFor(`${BASE}/about#team`, 3, false)).toBe(`${BASE}/about?v=3`)
  })

  it('floors fractional epochs', () => {
    expect(cacheKeyFor(`${BASE}/`, 42.7, false)).toBe(`${BASE}/?v=42`)
  })

  it.each([0, -4, Number.NaN])('falls back to version 1 for %s', (epoch) => {
    expect(cacheKeyFor(`${BASE}/`, epoch, false)).toBe(`${BASE}/?v=1`)
  })

  it('adds m=1 for mobile copies', () => {
    expect(cacheKeyFor(`${BASE}/`, 2, true)).toBe(`${BASE}/?v=2&m=1`)
  })

  it('gives a different key for each epoch', () => {
    expect(cacheKeyFor(`${BASE}/`, 1, false)).not.toBe(cacheKeyFor(`${BASE}/`, 2, false))
  })

  it('keeps the host, so two sites never share a key', () => {
    expect(cacheKeyFor('https://other.example.org/x', 1, false)).toBe('https://other.example.org/x?v=1')
  })
})

describe('isMobileUserAgent', () => {
  it.each([
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', true],
    ['Android phone', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari', true],
    ['iPad', 'Mozilla/5.0 (iPad; CPU OS 17_0)', true],
    ['desktop Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', false],
    ['missing header', null, false],
    ['empty header', '', false],
  ])('%s', (_name, ua, expected) => {
    expect(isMobileUserAgent(ua)).toBe(expected)
  })
})

describe('isCacheableResponse', () => {
  it.each([
    ['200 html', 200, { 'Content-Type': 'text/html; charset=utf-8' }, true],
    ['200 html, no charset', 200, { 'Content-Type': 'text/html' }, true],
    ['uppercase content type', 200, { 'Content-Type': 'TEXT/HTML' }, true],
    ['public cache-control is fine', 200, { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=60' }, true],
    ['404 is not stored', 404, { 'Content-Type': 'text/html' }, false],
    ['500 is not stored', 500, { 'Content-Type': 'text/html' }, false],
    ['redirect is not stored', 301, { 'Content-Type': 'text/html' }, false],
    ['json is not stored', 200, { 'Content-Type': 'application/json' }, false],
    ['no content type', 200, {}, false],
    ['set-cookie blocks storing', 200, { 'Content-Type': 'text/html', 'Set-Cookie': 'a=1' }, false],
    ['no-store blocks storing', 200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }, false],
    ['private blocks storing', 200, { 'Content-Type': 'text/html', 'Cache-Control': 'private, max-age=0' }, false],
    ['NO-STORE in caps blocks storing', 200, { 'Content-Type': 'text/html', 'Cache-Control': 'NO-STORE' }, false],
  ])('%s', (_name, status, hdrs, expected) => {
    expect(isCacheableResponse(status as number, headers(hdrs as Record<string, string>))).toBe(expected)
  })
})

describe('clampTtl', () => {
  it.each([
    ['missing uses 600', null, 600],
    ['undefined uses 600', undefined, 600],
    ['NaN uses 600', Number.NaN, 600],
    ['below minimum is raised to 30', 10, 30],
    ['above maximum is lowered to one week', 999999999, 604800],
    ['rounds to whole seconds', 1234.6, 1235],
    ['normal value kept', 3600, 3600],
  ])('%s', (_name, value, expected) => {
    expect(clampTtl(value as number | null | undefined)).toBe(expected)
  })
})
