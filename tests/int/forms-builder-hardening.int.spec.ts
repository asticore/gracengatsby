import { describe, expect, it } from 'vitest'

import { scopeCustomCss } from '@/features/forms/customCss'
import { sanitiseHtml } from '@/features/forms/htmlSanitize'
import { sanitiseLayout } from '@/features/forms/layout'
import { adminRequestRefusal } from '@/features/forms/origin'
import { checkFillTime, checkTurnstile } from '@/features/forms/spam'
import { parseSubmissionBody } from '@/features/forms/submitRequest'
import { isSafeWebhookUrl } from '@/features/forms/webhooks'
import { DEFAULT_FORM_SETTINGS } from '@/features/forms/settings'

describe('forms hardening', () => {
  it('sanitises html', () => {
    const out = sanitiseHtml('<p onclick="x()">hi<script>alert(1)</script><a href="javascript:alert(1)">a</a><a href="https://e.com" target="_blank">b</a><img src="data:text/html;base64,AA" onerror=1><iframe src=x></iframe></p>')
    expect(out).not.toMatch(/script|onclick|onerror|javascript|iframe|data:/i)
    expect(out).toContain('href="https://e.com"')
    expect(sanitiseHtml('<a href="&#106;avascript:alert(1)">x</a>')).not.toMatch(/javascript/i)
    const layout = sanitiseLayout([{ blockType: 'element', elementType: 'ff-html', props: { html: '<script>x</script><b>ok</b>' } }])
    expect(JSON.stringify(layout)).not.toContain('script')
    expect(JSON.stringify(layout)).toContain('<b>ok</b>')
  })

  it('blocks more webhook hosts', () => {
    for (const url of ['https://localhost./x', 'https://a.internal./x', 'https://100.64.1.1/x', 'https://192.0.0.8/x', 'https://198.18.0.1/x', 'https://x.local/']) {
      expect(isSafeWebhookUrl(url), url).toBe(false)
    }
    expect(isSafeWebhookUrl('https://example.com/hook')).toBe(true)
  })

  it('fails closed on spam checks', async () => {
    expect(checkFillTime(undefined, 3).spam).toBe(true)
    expect(checkFillTime(undefined, 0).spam).toBe(false)
    const verdict = await checkTurnstile('tok', { ...DEFAULT_FORM_SETTINGS, turnstile: true, captchaProvider: 'turnstile', turnstileSecretKey: '' } as never)
    expect(verdict.spam).toBe(true)
  })

  it('cleans custom css', () => {
    const css = scopeCustomCss('@font-face{src:url(https://x.com/a.woff)} a{background:url(https://evil/x.png)} b{background:url(/img/a.png)} </style><script>', 1)
    expect(css).not.toMatch(/font-face|evil|<|script/)
    expect(css).toContain('url(/img/a.png)')
  })

  it('caps request bodies', async () => {
    const big = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'a'.repeat(500_000) })
    const res = await parseSubmissionBody(big, 0)
    expect('error' in res && res.error.status).toBe(413)
    const multi = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=a' }, body: '--a--' })
    const refused = await parseSubmissionBody(multi, 0)
    expect('error' in refused && refused.error.status).toBe(400)
  })

  it('guards admin posts', () => {
    const mk = (headers: Record<string, string>) => new Request('https://site.test/api/x', { method: 'POST', headers })
    expect(adminRequestRefusal(mk({ 'content-type': 'text/plain' }))).toBeTruthy()
    expect(adminRequestRefusal(mk({ 'content-type': 'application/json', origin: 'https://evil.test' }))).toBeTruthy()
    expect(adminRequestRefusal(mk({ 'content-type': 'application/json', origin: 'https://site.test' }))).toBeNull()
  })
})