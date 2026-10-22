import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { EmbedCodeCanvasCard, EmbedCodeFrame } from '@/components/blocks/elements/EmbedCodeFrame'
import { EmbedCodeElement } from '@/components/blocks/elements/EmbedCodeServer'
import { CONSENT_COOKIE_NAME, CONSENT_STORAGE_KEY, LEGACY_CONSENT_STORAGE_KEY } from '@/features/consent/consent'
import { resetConsentStoreForTests } from '@/features/consent/store'
import {
  EMBED_CODE_CSP, EMBED_CODE_RESIZE_TYPE, EMBED_CODE_SANDBOX, buildFrameDocument, embedFrameHeaders, embedHeight, findEmbedSnippet,
  isEmbedFramePath, parseResizeMessage, safePagePath, snippetHash,
} from '@/lib/embedCode'
import { getElementDef } from '@/lib/elements/registry'
import { SITE_ELEMENT_TYPES } from '@/lib/elements/wave38Defs'
import { DEFAULT_CONTENT_SECURITY_POLICY, securityHeaders } from '@/features/security/headers'
import { DEFAULT_SECURITY_SETTINGS } from '@/features/security/settings'

let ctxPath: string | undefined
vi.mock('@/lib/blockContext', () => ({ getBlockContext: (): { path: string | undefined } => ({ path: ctxPath }), setBlockContext: (): undefined => undefined }))

const SNIPPET = '<script src="https://widget.example/embed.js"></script><div class="w" data-x="1"></div>'
const doc = (snippet: string): Record<string, unknown> => ({ id: 1, layout: [{ blockType: 'section', columns: [{ blocks: [{ blockType: 'element', elementType: 'embed-code', props: { snippet, title: 'Reviews' } }] }] }] })

describe('embed-code definition', () => {
  it('is registered as a server (site) media element and warns about third-party code', () => {
    const def = getElementDef('embed-code')!
    expect(def.category).toBe('media')
    expect(def.label).toContain('third-party script')
    expect(SITE_ELEMENT_TYPES.has('embed-code')).toBe(true)
    expect(def.fields.find((f) => f.name === 'snippet')!.helpText).toMatch(/third-party code/i)
    expect(getElementDef('html')!.fields[0].helpText).toContain('Embed code')
  })
})

describe('embed-code parent markup', () => {
  beforeEach(() => { ctxPath = '/reviews' })

  it('never contains the snippet, only the consent placeholder, a noscript note and no iframe', async () => {
    const hostile = '<script>alert("xss")</script><img src=x onerror=alert(1)>'
    const html = renderToStaticMarkup(await EmbedCodeElement({ snippet: hostile, title: 'Reviews "x"' }))
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<iframe')
    expect(html).toContain('noscript')
    expect(html).toContain('Accept and load')
  })

  it('renders nothing without a snippet or a page path', async () => {
    expect(await EmbedCodeElement({ snippet: '   ' })).toBeNull()
    ctxPath = undefined
    expect(await EmbedCodeElement({ snippet: SNIPPET })).toBeNull()
  })
})

describe('embed-code consent gate and iframe (browser)', () => {
  beforeEach(() => {
    resetConsentStoreForTests()
    document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`
    window.localStorage.clear()
    window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY)
  })
  afterEach(() => {
    cleanup()
    resetConsentStoreForTests()
    window.localStorage.removeItem(CONSENT_STORAGE_KEY)
  })
  const hash = 'a'.repeat(32)
  const frame = (extra = {}) => h(EmbedCodeFrame, { hash, path: '/reviews', title: 'Reviews', category: 'marketing', height: null, ...extra })

  it('holds the iframe back until consent, then loads a sandboxed same-origin route without allow-same-origin', () => {
    const { container } = render(frame())
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Accept and load' }))
    const f = container.querySelector('iframe')!
    expect(f.getAttribute('src')).toBe(`/embed-frame/${hash}?path=%2Freviews`)
    expect(f.getAttribute('sandbox')).toBe(EMBED_CODE_SANDBOX)
    expect(f.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(f.getAttribute('title')).toBe('Reviews')
    expect(f.getAttribute('src')).not.toContain('widget.example')
  })

  it('applies a reported height only from its own frame', () => {
    const { container } = render(frame())
    fireEvent.click(screen.getByRole('button', { name: 'Accept and load' }))
    const f = container.querySelector('iframe') as HTMLIFrameElement
    const msg = { type: EMBED_CODE_RESIZE_TYPE, hash, height: 640 }
    window.dispatchEvent(new MessageEvent('message', { data: msg, source: window }))
    expect(f.style.height).toBe('300px')
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: msg, source: f.contentWindow })) })
    expect(f.style.height).toBe('640px')
  })

  it('uses a fixed height and ignores messages', () => {
    const { container } = render(frame({ height: 420 }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept and load' }))
    expect((container.querySelector('iframe') as HTMLIFrameElement).style.height).toBe('420px')
  })

  it('canvas card shows the first 80 characters as text and never creates a script or frame', () => {
    const long = `<script src="https://x.example/a.js"></script>${'y'.repeat(200)}`
    const { container } = render(h(EmbedCodeCanvasCard, { snippet: long, title: '' }))
    expect(container.querySelector('script, iframe')).toBeNull()
    expect(container.querySelector('code')!.textContent).toBe(long.slice(0, 80))
  })
})

describe('embed-code route logic', () => {
  it('finds a snippet by hash in the document and nothing else', async () => {
    const hash = await snippetHash(SNIPPET)
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
    expect((await findEmbedSnippet(doc(SNIPPET), hash))!.snippet).toBe(SNIPPET)
    expect(await findEmbedSnippet(doc('<p>other</p>'), hash)).toBeNull()
    expect(await findEmbedSnippet({ id: 1, layout: [] }, hash)).toBeNull()
  })

  it('serves a document with the raw snippet, the resize script and strict headers', async () => {
    const hash = await snippetHash(SNIPPET)
    const body = buildFrameDocument(SNIPPET, hash, 'Rev"iews<')
    expect(body).toContain(SNIPPET)
    expect(body).toContain(EMBED_CODE_RESIZE_TYPE)
    expect(body).toContain('<title>Rev&quot;iews&lt;</title>')
    const headers = embedFrameHeaders()
    expect(headers['Content-Security-Policy']).toBe(EMBED_CODE_CSP)
    expect(EMBED_CODE_CSP).toContain("frame-ancestors 'self'")
    expect(EMBED_CODE_CSP).toContain('sandbox allow-scripts')
    expect(EMBED_CODE_CSP).not.toContain('allow-same-origin')
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(headers['Cache-Control']).toContain('no-store')
  })

  it('validates page paths and frame paths', () => {
    expect(safePagePath('/a/b?x=1')).toBe('/a/b')
    for (const bad of ['//evil.example', 'https://evil.example', '/a\\b', '', null, 5]) expect(safePagePath(bad)).toBeNull()
    expect(isEmbedFramePath(`/embed-frame/${'a'.repeat(32)}`)).toBe(true)
    expect(isEmbedFramePath('/embed-frame/zz')).toBe(false)
    expect(embedHeight(0)).toBeNull()
    expect(embedHeight(99999)).toBe(5000)
    expect(embedHeight('200')).toBe(200)
  })
})

describe('embed-code headers', () => {
  const on = { ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true }
  const path = `/embed-frame/${'b'.repeat(32)}`

  it('gives the frame route its own CSP and leaves the site CSP strict', () => {
    expect(securityHeaders(on, path)['Content-Security-Policy']).toBe(EMBED_CODE_CSP)
    expect(securityHeaders(on, path)['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(securityHeaders(on, '/reviews')['Content-Security-Policy']).toBe(DEFAULT_CONTENT_SECURITY_POLICY)
    expect(DEFAULT_CONTENT_SECURITY_POLICY).not.toContain('sandbox')
  })

  it('keeps the admin portal policy-free and an admin custom CSP on other paths', () => {
    expect(securityHeaders(on, '/admin/x')['Content-Security-Policy']).toBeUndefined()
    const custom = { ...on, headers: { ...on.headers, contentSecurityPolicy: "default-src 'self'" } }
    expect(securityHeaders(custom, '/reviews')['Content-Security-Policy']).toBe("default-src 'self'")
  })
})

describe('embed-code resize message validation', () => {
  const win = {}
  const ok = { type: EMBED_CODE_RESIZE_TYPE, hash: 'h', height: 500 }
  it('accepts only the owning frame, type, hash and a sane number', () => {
    expect(parseResizeMessage({ source: win, data: ok }, win, 'h')).toBe(500)
    expect(parseResizeMessage({ source: {}, data: ok }, win, 'h')).toBeNull()
    expect(parseResizeMessage({ source: win, data: ok }, null, 'h')).toBeNull()
    expect(parseResizeMessage({ source: win, data: { ...ok, hash: 'z' } }, win, 'h')).toBeNull()
    expect(parseResizeMessage({ source: win, data: { ...ok, type: 'x' } }, win, 'h')).toBeNull()
    expect(parseResizeMessage({ source: win, data: { ...ok, height: '500' } }, win, 'h')).toBeNull()
    expect(parseResizeMessage({ source: win, data: { ...ok, height: -4 } }, win, 'h')).toBeNull()
    expect(parseResizeMessage({ source: win, data: { ...ok, height: 1e9 } }, win, 'h')).toBe(5000)
    expect(parseResizeMessage({ source: win, data: 'str' }, win, 'h')).toBeNull()
  })
})

