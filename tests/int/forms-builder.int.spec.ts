// @vitest-environment node
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FormRenderer } from '@/features/forms/components/FormRenderer'
import { cleanOrigin, generateEmbedKey, normaliseFormConfig } from '@/features/forms/config'
import { buildCsv } from '@/features/forms/csv'
import { scopeCustomCss } from '@/features/forms/customCss'
import { applyEmbedFrame, decideEmbedFrame, embedPathKey } from '@/features/forms/embedFrame'
import { iframeSnippet, loaderScript, scriptSnippet } from '@/features/forms/embedScript'
import {
  flattenLayout,
  hasUnpublishedChanges,
  isPublished,
  resolveLayout,
  sanitiseLayout,
  splitLayoutIntoSteps,
  upgradeFieldsToLayout,
  type LayoutNode,
} from '@/features/forms/layout'
import { checkOrigin, corsHeaders, frameAncestors } from '@/features/forms/origin'
import { computePrefill } from '@/features/forms/prefill'
import { handleSubmitRequest } from '@/features/forms/submitRequest'
import { hasFormShortcode, splitFormShortcodes } from '@/features/forms/shortcode'
import { checkFillTime, checkHoneypot, checkRecaptcha } from '@/features/forms/spam'
import { DEFAULT_FORM_SETTINGS, toPublicConfig } from '@/features/forms/settings'
import { applyInboxPatch, parseInboxPatch, parseSubmissionFilters, submissionsWhere } from '@/features/forms/submissionsApi'
import { fieldPolicy, inspectFiles } from '@/features/forms/upload'
import { validateSubmission } from '@/features/forms/validate'
import { isSafeWebhookUrl, nextAttemptAt, signPayload, summariseAttempts, verifySignature, type WebhookAttempt } from '@/features/forms/webhooks'
import { ruleMatches, renderTemplate } from '@/features/forms/notify'
import type { FormDoc, FormFieldDef } from '@/features/forms/types'

const field = (node: Partial<LayoutNode> & { elementType: string; props?: Record<string, unknown> }, id: string): LayoutNode => ({
  blockType: 'element',
  _id: id,
  ...node,
})

const twoColumnLayout = (): LayoutNode[] => [
  {
    blockType: 'section',
    _id: 's1',
    columns: [
      { _id: 'c1', widthDesktop: { value: 6, unit: 'fraction' }, blocks: [field({ elementType: 'ff-text', props: { label: 'First name', required: true } }, 'a')] },
      { _id: 'c2', widthDesktop: { value: 6, unit: 'fraction' }, blocks: [field({ elementType: 'ff-email', props: { label: 'Email', required: true } }, 'b')] },
    ],
  },
  field({ elementType: 'ff-step', props: { title: 'More' } }, 'step'),
  {
    blockType: 'section',
    _id: 's2',
    columns: [{ _id: 'c3', widthDesktop: { value: 12, unit: 'fraction' }, blocks: [field({ elementType: 'ff-textarea', props: { label: 'Message' } }, 'c')] }],
  },
]

describe('layout: flattening, steps and legacy upgrade', () => {
  it('flattens nested columns in document order with unique names', () => {
    const fields = flattenLayout(twoColumnLayout())
    expect(fields.map((f) => f.type)).toEqual(['text', 'email', 'page', 'textarea'])
    expect(fields.map((f) => f.name).filter(Boolean)).toEqual(['first_name', 'email', 'message'])
  })

  it('gives duplicate labels distinct names', () => {
    const layout = [field({ elementType: 'ff-text', props: { label: 'Name' } }, 'a'), field({ elementType: 'ff-text', props: { label: 'Name' } }, 'b')]
    const names = flattenLayout(layout).map((f) => f.name)
    expect(new Set(names).size).toBe(2)
  })

  it('splits at top-level step breaks only', () => {
    const steps = splitLayoutIntoSteps(twoColumnLayout())
    expect(steps).toHaveLength(2)
    expect(steps[1]).toHaveLength(1)
  })

  it('upgrades a legacy flat field list, deterministically and without losing fields', () => {
    const legacy: FormFieldDef[] = [
      { type: 'text', name: 'your_name', label: 'Your name', required: true, width: 'half' },
      { type: 'page', label: 'Page two' },
      { type: 'select', name: 'plan', label: 'Plan', options: [{ label: 'Pro', value: 'pro' }] },
    ]
    const once = upgradeFieldsToLayout(legacy)
    const twice = upgradeFieldsToLayout(legacy)
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
    const back = flattenLayout(once)
    expect(back.filter((f) => f.type !== 'page').map((f) => f.name)).toEqual(['your_name', 'plan'])
    expect(back.find((f) => f.name === 'your_name')?.required).toBe(true)
    expect(back.find((f) => f.name === 'plan')?.options?.[0].value).toBe('pro')
  })

  it('reads a form that has no layout from its old fields, and does not change the stored form', () => {
    const form: FormDoc = { id: 1, fields: [{ type: 'text', name: 'a', label: 'A' }] }
    const before = JSON.stringify(form)
    const resolved = resolveLayout(form)
    expect(resolved.legacy).toBe(true)
    expect(resolved.fields.map((f) => f.name)).toEqual(['a'])
    expect(JSON.stringify(form)).toBe(before)
  })

  it('a stored layout wins, and the public site reads the published copy only', () => {
    const published = [field({ elementType: 'ff-text', props: { label: 'Live' } }, 'p')]
    const working = [field({ elementType: 'ff-text', props: { label: 'Draft edit' } }, 'w')]
    const form: FormDoc = { id: 2, layout: working, publishedLayout: published, formStatus: 'published' }
    expect(resolveLayout(form).fields[0].label).toBe('Live')
    expect(resolveLayout(form, { draft: true }).fields[0].label).toBe('Draft edit')
    expect(hasUnpublishedChanges(form)).toBe(true)
  })

  it('treats a missing status as published and a draft as not', () => {
    expect(isPublished({})).toBe(true)
    expect(isPublished({ formStatus: 'published' })).toBe(true)
    expect(isPublished({ formStatus: 'draft' })).toBe(false)
  })

  it('sanitises a layout: drops junk, refuses a non-array', () => {
    expect(sanitiseLayout('nope')).toBeNull()
    const cleaned = sanitiseLayout([{ blockType: 'section', columns: [{ blocks: [{ nope: true }, { blockType: 'element', elementType: 'ff-text' }] }] }, 7])
    expect(cleaned).toHaveLength(1)
    expect(cleaned![0].columns![0].blocks).toHaveLength(1)
  })
})

describe('layout rendering', () => {
  const config = (layout: LayoutNode[], extra: Record<string, unknown> = {}) => {
    const form: FormDoc = { id: 7, title: 'T', publishedLayout: layout, formStatus: 'published', embedKey: 'abcdefgh1234', ...extra }
    return toPublicConfig(form, DEFAULT_FORM_SETTINGS)
  }

  it('draws fields inside columns with the column widths as CSS variables', () => {
    const html = renderToString(React.createElement(FormRenderer, { config: config(twoColumnLayout()) }))
    expect(html).toContain('--be-col-d:50%')
    expect(html).toContain('First name')
    expect(html).toContain('type="email"')
    // The second step is in the markup but hidden until Next.
    expect(html).toContain('engage-form__step')
    expect(html).toMatch(/hidden=""[^>]*>[\s\S]*Message/)
  })

  it('shows a progress bar for a multi-step form and honours the style preset and accent', () => {
    const html = renderToString(
      React.createElement(FormRenderer, {
        config: config(twoColumnLayout(), { formConfig: { style: { preset: 'card', accent: '#112233' }, steps: { progressStyle: 'bar' } } }),
      }),
    )
    expect(html).toContain('engage-form__bar')
    expect(html).toContain('engage-form--card')
    expect(html).toContain('--eg-accent:#112233')
  })

  it('scopes custom CSS to the form and drops imports', () => {
    const html = renderToString(
      React.createElement(FormRenderer, {
        config: config(twoColumnLayout(), { formConfig: { style: { customCss: '@import url(x.css); .form-field { color: red }' } } }),
      }),
    )
    expect(html).toContain('.eg-form-7 .form-field')
    expect(html).not.toContain('@import')
  })

  it('renders a legacy form (no layout) the same way as before', () => {
    const legacy: FormDoc = { id: 3, title: 'Old', fields: [{ type: 'text', name: 'n', label: 'Name' }, { type: 'checkbox', name: 'ok', label: 'OK' }] }
    const html = renderToString(React.createElement(FormRenderer, { config: toPublicConfig(legacy, DEFAULT_FORM_SETTINGS) }))
    expect(html).toContain('Name')
    expect(html).toContain('type="checkbox"')
  })

  it('includes a honeypot, never the secrets', () => {
    const publicConfig = config(twoColumnLayout())
    expect(JSON.stringify(publicConfig)).not.toMatch(/secret|recaptchaSecret|recipients/i)
    const html = renderToString(React.createElement(FormRenderer, { config: publicConfig }))
    expect(html).toContain('eg_company_website')
  })
})

describe('validation of every field type', () => {
  const run = (f: FormFieldDef, value: unknown, now = new Date('2026-10-01T00:00:00Z')) => {
    const named = { name: 'x', label: 'X', ...f }
    return validateSubmission([named], { x: value }, new Set(['x']), now)
  }

  it('required and email', () => {
    expect(run({ type: 'text', required: true }, '').errors.x).toMatch(/required/)
    expect(run({ type: 'email' }, 'nope').errors.x).toBeTruthy()
    expect(run({ type: 'email' }, 'a@b.co').errors.x).toBeUndefined()
  })

  it('pattern and length rules', () => {
    expect(run({ type: 'text', validation: { pattern: '^[0-9]{4}$', patternMessage: 'Four digits' } }, 'abc').errors.x).toBe('Four digits')
    expect(run({ type: 'text', validation: { minLength: 3 } }, 'ab').errors.x).toBeTruthy()
    expect(run({ type: 'text', validation: { pattern: '^[0-9]{4}$' } }, '1234').errors.x).toBeUndefined()
  })

  it('rating, nps, time, datetime, consent', () => {
    expect(run({ type: 'rating', scaleMax: 5 }, 6).errors.x).toBeTruthy()
    expect(run({ type: 'rating', scaleMax: 5 }, '4').values.x).toBe(4)
    expect(run({ type: 'nps' }, 11).errors.x).toBeTruthy()
    expect(run({ type: 'time' }, '25:00').errors.x).toBeTruthy()
    expect(run({ type: 'time' }, '9:30').values.x).toBe('09:30')
    expect(run({ type: 'datetime' }, '2026-02-30T10:00').errors.x).toBeTruthy()
    expect(run({ type: 'consent', required: true }, false).errors.x).toBeTruthy()
    expect(run({ type: 'consent', required: true }, 'true').values.x).toBe(true)
  })

  it('signature accepts only a small PNG data URL', () => {
    expect(run({ type: 'signature' }, 'data:image/png;base64,iVBORw0KGgo=').errors.x).toBeUndefined()
    expect(run({ type: 'signature' }, 'data:text/html;base64,PHNjcmlwdD4=').errors.x).toBeTruthy()
  })

  it('matrix reduces to known rows and columns', () => {
    const matrix: FormFieldDef = { type: 'matrix', rows: [{ label: 'Food', value: 'food' }], options: [{ label: 'Good', value: 'good' }] }
    expect(run(matrix, { food: 'good', extra: 'x' }).values.x).toEqual({ food: 'good' })
    expect(run(matrix, { food: 'unknown' }).errors.x).toBeTruthy()
  })

  it('address keeps known parts and clamps coordinates', () => {
    const result = run({ type: 'address' }, { line1: '1 High St', city: 'Perth', evil: 'x', lat: 999, lon: 115.8 })
    expect(result.values.x).toEqual({ line1: '1 High St', city: 'Perth', lon: 115.8 })
  })

  it('appointment must be an open day and a listed time within the window', () => {
    const appointment: FormFieldDef = { type: 'appointment', appointment: { slots: ['09:00', '10:00'], weekdays: [1, 2, 3, 4, 5], daysAhead: 30 } }
    expect(run(appointment, '2026-10-05 09:00').values.x).toBe('2026-10-05 09:00') // a Monday
    expect(run(appointment, '2026-10-04 09:00').errors.x).toMatch(/not available/) // a Sunday
    expect(run(appointment, '2026-10-05 11:00').errors.x).toMatch(/not available/)
    expect(run(appointment, '2026-12-25 09:00').errors.x).toBeTruthy()
  })

  it('a hidden (not visible) field is not validated', () => {
    const result = validateSubmission([{ type: 'text', name: 'x', required: true }], {}, new Set())
    expect(result.errors).toEqual({})
  })
})

describe('origin allow-list and CORS', () => {
  it('allows any website when the list is empty, and says so', () => {
    const decision = checkOrigin('https://other.example', [])
    expect(decision).toMatchObject({ allowed: true, open: true, origin: 'https://other.example' })
  })

  it('allows only listed origins, exact or wildcard subdomain', () => {
    const list = ['https://good.example', 'https://*.partner.example']
    expect(checkOrigin('https://good.example', list).allowed).toBe(true)
    expect(checkOrigin('https://evil.example', list).allowed).toBe(false)
    expect(checkOrigin('https://a.b.partner.example', list).allowed).toBe(true)
    expect(checkOrigin('https://partner.example', list).allowed).toBe(false)
    expect(checkOrigin('http://good.example', list).allowed).toBe(false)
    expect(checkOrigin('https://good.example.evil.example', list).allowed).toBe(false)
  })

  it('always allows this site itself, and a request with no Origin', () => {
    expect(checkOrigin('https://site.example', ['https://good.example'], 'https://site.example').allowed).toBe(true)
    expect(checkOrigin(null, ['https://good.example']).allowed).toBe(true)
  })

  it('refuses the "null" origin and malformed ones', () => {
    expect(checkOrigin('null', ['https://good.example']).allowed).toBe(false)
    expect(checkOrigin('not a url', []).allowed).toBe(false)
  })

  it('never echoes a wildcard or sends credentials', () => {
    const headers = corsHeaders('https://good.example')
    expect(headers['Access-Control-Allow-Origin']).toBe('https://good.example')
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined()
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined()
    expect(cleanOrigin('*')).toBeNull()
    expect(cleanOrigin('https://x.example/path')).toBeNull()
  })

  it('frame-ancestors follows the list', () => {
    expect(frameAncestors([])).toBe('*')
    expect(frameAncestors(['https://good.example'])).toBe("'self' https://good.example")
  })
})

type StubForm = FormDoc & { id: number }

function stubEngine(form: StubForm | null) {
  return {
    findGlobal: async () => ({ features: { forms: true } }),
    findByID: async () => form,
    find: async () => ({ docs: form ? [form] : [] }),
    create: async () => ({ id: 1 }),
    logger: { info() {}, warn() {}, error() {} },
  }
}

const publishedForm = (allowedOrigins: string[], extra: Partial<StubForm> = {}): StubForm => ({
  id: 5,
  title: 'T',
  embedKey: 'abcdefgh1234',
  formStatus: 'published',
  publishedLayout: [field({ elementType: 'ff-text', props: { label: 'Name' } }, 'a')],
  formConfig: { embed: { allowedOrigins } },
  ...extra,
})

describe('submit endpoint: origin checks on preflight and POST', () => {
  const request = (method: string, origin: string | null, body?: string) =>
    new Request('https://site.example/api/forms/5/submit', {
      method,
      headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' },
      body,
    })

  it('answers a preflight from an allowed origin with CORS headers', async () => {
    const response = await handleSubmitRequest(request('OPTIONS', 'https://good.example'), stubEngine(publishedForm(['https://good.example'])) as never, '5')
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://good.example')
  })

  it('refuses a preflight and a POST from a website that is not allowed', async () => {
    const engine = stubEngine(publishedForm(['https://good.example'])) as never
    const preflight = await handleSubmitRequest(request('OPTIONS', 'https://evil.example'), engine, '5')
    expect(preflight.status).toBe(403)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull()
    const post = await handleSubmitRequest(request('POST', 'https://evil.example', '{}'), engine, '5')
    expect(post.status).toBe(403)
  })

  it('404s for a draft, an unknown form and the feature being off', async () => {
    const draft = await handleSubmitRequest(request('POST', null, '{}'), stubEngine(publishedForm([], { formStatus: 'draft' })) as never, '5')
    expect(draft.status).toBe(404)
    const unknown = await handleSubmitRequest(request('POST', null, '{}'), stubEngine(null) as never, '5')
    expect(unknown.status).toBe(404)
    const off = { ...stubEngine(publishedForm([])), findGlobal: async () => ({ features: { forms: false } }) }
    expect((await handleSubmitRequest(request('POST', null, '{}'), off as never, '5')).status).toBe(404)
  })
})

describe('embed route: framing and snippets', () => {
  it('matches only /embed/forms/<key>', () => {
    expect(embedPathKey('/embed/forms/abc123')).toBe('abc123')
    expect(embedPathKey('/embed/forms/abc123/')).toBe('abc123')
    expect(embedPathKey('/embed/forms/abc/../x')).toBeNull()
    expect(embedPathKey('/embed/forms')).toBeNull()
    expect(embedPathKey('/admin/embed/forms/abc')).toBeNull()
    expect(embedPathKey('/pricing')).toBeNull()
  })

  it('frames only for a form that has embedding on and is not a draft', () => {
    expect(decideEmbedFrame(null).frameable).toBe(false)
    expect(decideEmbedFrame({ formConfig: '{}', formStatus: 'draft' }).frameable).toBe(false)
    expect(decideEmbedFrame({ formConfig: JSON.stringify({ embed: { enabled: false } }), formStatus: 'published' }).frameable).toBe(false)
    const decision = decideEmbedFrame({ formConfig: JSON.stringify({ embed: { allowedOrigins: ['https://good.example'] } }), formStatus: null })
    expect(decision).toEqual({ frameable: true, contentSecurityPolicy: "frame-ancestors 'self' https://good.example" })
  })

  it('replaces X-Frame-Options and any earlier frame-ancestors, leaves a blocked form alone', () => {
    const headers = new Headers({ 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" })
    applyEmbedFrame(headers, { frameable: true, contentSecurityPolicy: 'frame-ancestors https://good.example' })
    expect(headers.get('X-Frame-Options')).toBeNull()
    expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors https://good.example")

    const untouched = new Headers({ 'X-Frame-Options': 'SAMEORIGIN' })
    applyEmbedFrame(untouched, { frameable: false })
    expect(untouched.get('X-Frame-Options')).toBe('SAMEORIGIN')
  })

  it('writes snippets and a loader that only trusts its own origin', () => {
    expect(scriptSnippet('https://site.example/', 'abc')).toBe('<script src="https://site.example/embed/forms.js" data-form="abc" async></script>')
    expect(iframeSnippet('https://site.example', 'abc')).toContain('src="https://site.example/embed/forms/abc"')
    const script = loaderScript('https://site.example')
    expect(script).toContain('event.origin!==ORIGIN')
    expect(script).toContain('"https://site.example"')
    expect(() => new Function(script)).not.toThrow()
  })
})

describe('spam checks', () => {
  it('honeypot', () => {
    expect(checkHoneypot('x', true).spam).toBe(true)
    expect(checkHoneypot('', true).spam).toBe(false)
    expect(checkHoneypot('x', false).spam).toBe(false)
  })

  it('time trap rejects a fast submission, forgives a missing stamp', () => {
    const now = 1_000_000
    expect(checkFillTime(now - 500, 3, now).spam).toBe(true)
    expect(checkFillTime(now - 5000, 3, now).spam).toBe(false)
    expect(checkFillTime(undefined, 3, now).spam).toBe(true)
  })

  it('reCAPTCHA: score threshold, missing token, outage lets through', async () => {
    const settings = { ...DEFAULT_FORM_SETTINGS, turnstile: true, captchaProvider: 'recaptcha' as const, recaptchaSecretKey: 'secret', recaptchaMinScore: 0.5 }
    const reply = (body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body))) as never
    expect((await checkRecaptcha('tok', settings, undefined, reply({ success: true, score: 0.9 }))).spam).toBe(false)
    expect((await checkRecaptcha('tok', settings, undefined, reply({ success: true, score: 0.1 }))).spam).toBe(true)
    expect((await checkRecaptcha('tok', settings, undefined, reply({ success: false }))).spam).toBe(true)
    expect((await checkRecaptcha('', settings, undefined, reply({ success: true, score: 1 }))).spam).toBe(true)
    const down = (async () => {
      throw new Error('offline')
    }) as never
    expect((await checkRecaptcha('tok', settings, undefined, down)).spam).toBe(true)
    expect((await checkRecaptcha('tok', { ...settings, captchaProvider: 'turnstile' }, undefined, reply({ success: false }))).spam).toBe(false) // wrong provider: not this check's job
  })
})

describe('webhooks', () => {
  it('signs and verifies, rejecting tampering and stale timestamps', async () => {
    const body = JSON.stringify({ a: 1 })
    const t = 1_700_000_000
    const sig = await signPayload('s3cret', t, body)
    expect(await verifySignature('s3cret', `t=${t},v1=${sig}`, body, t + 10)).toBe(true)
    expect(await verifySignature('s3cret', `t=${t},v1=${sig}`, body + ' ', t + 10)).toBe(false)
    expect(await verifySignature('other', `t=${t},v1=${sig}`, body, t + 10)).toBe(false)
    expect(await verifySignature('s3cret', `t=${t},v1=${sig}`, body, t + 10_000)).toBe(false)
  })

  it('refuses unsafe destinations', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com/x')).toBe(true)
    for (const bad of ['http://hooks.example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/x', 'https://user:pw@x.example/', 'https://[::1]/', 'ftp://x.example', 'nope']) {
      expect(isSafeWebhookUrl(bad), bad).toBe(false)
    }
  })

  it('retry log: backs off, then gives up', () => {
    const at = '2026-10-01T00:00:00.000Z'
    const attempt = (n: number, ok: boolean): WebhookAttempt => ({ webhookId: 'w1', name: 'W', host: 'x', attempt: n, at, ok })
    expect(summariseAttempts([]).state).toBe('none')
    expect(summariseAttempts([attempt(1, true)]).state).toBe('ok')
    const retry = summariseAttempts([attempt(1, false)])
    expect(retry.state).toBe('retry')
    expect(new Date(retry.retryAt!).getTime()).toBeGreaterThan(new Date(at).getTime())
    expect(summariseAttempts([attempt(1, false), attempt(2, true)]).state).toBe('ok')
    expect(summariseAttempts([attempt(5, false)]).state).toBe('failed')
    expect(nextAttemptAt(5)).toBeNull()
  })
})

describe('notifications', () => {
  it('a rule with conditions sends only when they match', () => {
    const conditions = { enabled: true, match: 'all' as const, rules: [{ field: 'plan', operator: 'equals', value: 'pro' }] }
    expect(ruleMatches(conditions, { plan: 'pro' })).toBe(true)
    expect(ruleMatches(conditions, { plan: 'free' })).toBe(false)
    expect(ruleMatches(undefined, {})).toBe(true)
  })

  it('merge tags are escaped in HTML and never reach other keys', () => {
    expect(renderTemplate('Hi {{name}} {{missing}}', { name: '<b>x</b>' }, [], true)).toBe('Hi &lt;b&gt;x&lt;/b&gt; ')
    expect(renderTemplate('{{constructor}}', {}, [], false)).toBe('')
  })
})

describe('file uploads', () => {
  const site = { allowedExtensions: ['pdf', 'png'], maxBytes: 1024 }
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  it('accepts an allowed type whose bytes match', () => {
    const result = inspectFiles({ type: 'file', name: 'f' }, [{ name: 'a.png', type: 'image/png', size: 12, data: png }], site)
    expect(result.error).toBeUndefined()
    expect(result.ok).toHaveLength(1)
  })

  it('refuses a type that is not allowed, a mismatched body, and too many files', () => {
    expect(inspectFiles({ type: 'file', name: 'f' }, [{ name: 'a.exe', type: 'application/x-msdownload', size: 12, data: png }], site).error).toBeTruthy()
    expect(inspectFiles({ type: 'file', name: 'f' }, [{ name: 'a.png', type: 'image/png', size: 4, data: new Uint8Array([1, 2, 3, 4]) }], site).error).toBeTruthy()
    const many = Array.from({ length: 6 }, () => ({ name: 'a.png', type: 'image/png', size: 12, data: png }))
    expect(inspectFiles({ type: 'file', name: 'f' }, many, site).error).toBeTruthy()
  })

  it('a field can only narrow the site list, never widen it', () => {
    expect(fieldPolicy({ type: 'file', accept: '.pdf,.exe' }, site).allowedExtensions).toEqual(['pdf'])
    expect(fieldPolicy({ type: 'file', maxFileMb: 0.0001 }, site).maxBytes).toBeLessThan(1024)
  })
})

describe('custom CSS, prefill and config', () => {
  it('scopes every selector and strips what could escape', () => {
    const css = scopeCustomCss('.a, .b { color: red } @media (max-width:600px){ .c{ color:blue } } </style><script>x</script>', 'f1')
    expect(css).toContain('.eg-form-f1 .a')
    expect(css).toContain('.eg-form-f1 .b')
    expect(css).toContain('@media')
    expect(css).not.toMatch(/<\/?style|<script/i)
    expect(scopeCustomCss('@import url(//evil.example/x.css);', 'f1')).not.toContain('evil')
  })

  it('prefills only whitelisted keys and valid choices', () => {
    const fields: FormFieldDef[] = [
      { type: 'text', name: 'name', prefillKey: 'name' },
      { type: 'text', name: 'secret', prefillKey: 'secret' },
      { type: 'select', name: 'plan', prefillKey: 'plan', options: [{ label: 'Pro', value: 'pro' }] },
    ]
    expect(computePrefill(fields, ['name', 'plan'], { name: 'Ann', secret: 'x', plan: 'pro' })).toEqual({ name: 'Ann', plan: 'pro' })
    expect(computePrefill(fields, ['plan'], { plan: 'enterprise' })).toEqual({})
    expect(computePrefill(fields, [], { name: 'Ann' })).toEqual({})
  })

  it('normalises hostile config', () => {
    const config = normaliseFormConfig({
      style: { preset: 'nonsense', accent: 'red; background:url(x)', customCss: 5 },
      embed: { allowedOrigins: ['https://ok.example', '*', 'javascript:alert(1)', 'https://ok.example/'] },
      webhooks: Array.from({ length: 20 }, () => ({ url: 'https://x.example' })),
      prefillKeys: ['good_key', 'bad key!', 7],
    })
    expect(config.style?.preset).toBe('theme')
    expect(config.style?.accent).toBeUndefined()
    expect(config.embed?.allowedOrigins).toEqual(['https://ok.example'])
    expect(config.webhooks).toHaveLength(5)
    expect(config.prefillKeys).toEqual(['good_key'])
    expect(generateEmbedKey()).toMatch(/^[a-z0-9]{8,40}$/)
  })
})

describe('shortcode', () => {
  const paragraph = (text: string) => ({ type: 'paragraph', children: [{ type: 'text', text }] })

  it('splits around a paragraph that is only the shortcode', () => {
    const segments = splitFormShortcodes([paragraph('Before'), paragraph('[form id="abc123"]'), paragraph('After')])
    expect(segments.map((s) => s.type)).toEqual(['nodes', 'form', 'nodes'])
    expect(segments[1]).toEqual({ type: 'form', id: 'abc123' })
  })

  it('ignores a shortcode inside a sentence', () => {
    expect(hasFormShortcode([paragraph('Use [form id="1"] to embed')])).toBe(false)
  })
})

describe('submissions inbox helpers', () => {
  it('parses filters and ignores junk', () => {
    const filters = parseSubmissionFilters(new URLSearchParams('form=3&status=spam&assignee=none&from=2026-01-02&to=bad&q=%20hello%20'))
    expect(filters).toEqual({ form: 3, status: 'spam', assignee: 'none', from: '2026-01-02', q: 'hello' })
    expect(parseSubmissionFilters({ status: 'wat', form: '-1' })).toEqual({})
    expect(submissionsWhere({ status: 'open' })).toEqual({ and: [{ status: { in: ['new', 'read'] } }] })
  })

  it('allows only status, assignee and notes to change', () => {
    expect(parseInboxPatch({ status: 'read', values: { x: 1 } }).patch).toEqual({ status: 'read' })
    expect(parseInboxPatch({ status: 'bogus' }).error).toBeTruthy()
    expect(parseInboxPatch({ assignee: 'none' }).patch).toEqual({ assignee: null })
    expect(parseInboxPatch({ values: {} }).error).toBeTruthy()
  })

  it('applies a bulk change to unique ids and reports failures', async () => {
    const calls: unknown[] = []
    const engine = {
      update: async (args: Record<string, unknown>) => {
        calls.push(args.id)
        if (args.id === 2) throw new Error('nope')
      },
    }
    const result = await applyInboxPatch(engine, [1, 2, 2, 'x', 3], { status: 'archived' })
    expect(result).toEqual({ changed: [1, 3], failed: [2] })
    expect(calls).toEqual([1, 2, 3])
  })

  it('exports inbox columns only when rows carry them', () => {
    const form: FormDoc = { id: 1, fields: [{ type: 'text', name: 'a', label: 'A' }] }
    const plain = buildCsv(form, [{ id: 1, values: { a: 'x' } }]).split('\r\n')[0]
    expect(plain).not.toContain('Status')
    const withInbox = buildCsv(form, [{ id: 1, status: 'new', assignee: 'Sam', notes: '=1+1', values: { a: 'x' } }])
    expect(withInbox.split('\r\n')[0]).toContain('Status,Assigned to,Notes')
    expect(withInbox).toContain('\t=1+1')
  })
})
