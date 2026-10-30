// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  MAX_ATTEMPTS,
  MAX_PAYLOAD_BYTES,
  checkWebhookUrl,
  isBlockedIPv4,
  nextAttemptAt,
  newSigningSecret,
  renderBody,
  signatureHeader,
  validateTemplate,
  validateWebhook,
  verifySignature,
} from '@/features/webhooks/core'
import { buildWebhookGuideMarkdown, markdownSectionToHtml, webhookSectionMarkdown } from '@/features/webhooks/docs'
import { pickEventFields, WEBHOOK_EVENTS } from '@/features/webhooks/events'

describe('webhook addresses (SSRF guard)', () => {
  it('accepts a public https address on the standard port', () => {
    expect(checkWebhookUrl('https://hooks.example.com/incoming?x=1')).toEqual({ ok: true, value: 'https://hooks.example.com/incoming?x=1' })
  })

  it.each([
    ['plain http', 'http://hooks.example.com/x'],
    ['credentials', 'https://user:pass@hooks.example.com/x'],
    ['another port', 'https://hooks.example.com:8443/x'],
    ['IPv6 literal', 'https://[::1]/x'],
    ['loopback', 'https://127.0.0.1/x'],
    ['loopback as one number', 'https://2130706433/x'],
    ['loopback in hex', 'https://0x7f.0.0.1/x'],
    ['private 10/8', 'https://10.0.0.5/x'],
    ['private 192.168/16', 'https://192.168.1.1/x'],
    ['private 172.16/12', 'https://172.16.0.1/x'],
    ['carrier NAT 100.64/10', 'https://100.64.1.1/x'],
    ['link-local and metadata 169.254.169.254', 'https://169.254.169.254/latest/meta-data'],
    ['unspecified 0.0.0.0', 'https://0.0.0.0/x'],
    ['multicast', 'https://224.0.0.1/x'],
    ['localhost name', 'https://localhost/x'],
    ['internal suffix', 'https://service.internal/x'],
    ['local suffix', 'https://printer.local/x'],
    ['cloud metadata name', 'https://metadata.google.internal/computeMetadata/v1/'],
    ['single label', 'https://hooks/x'],
    ['numeric top label', 'https://1.2.3.4.5/x'],
  ])('refuses %s', (_label, url) => {
    expect(checkWebhookUrl(url).ok).toBe(false)
  })

  it('reports the private-address case in plain words', () => {
    const result = checkWebhookUrl('https://10.1.2.3/x')
    expect(result.ok === false && result.error).toMatch(/private or internal/)
  })

  it('blocks the reserved IPv4 ranges and nothing public', () => {
    expect(isBlockedIPv4(8, 8, 8)).toBe(false)
    expect(isBlockedIPv4(203, 0, 114)).toBe(false)
    expect(isBlockedIPv4(198, 51, 100)).toBe(true)
    expect(isBlockedIPv4(240, 0, 0)).toBe(true)
  })
})

describe('webhook settings', () => {
  const good = { name: 'Orders', url: 'https://hooks.example.com/x', events: ['order.paid'], template: '', enabled: true, ratePerMinute: 30 }

  it('accepts a valid definition and keeps the standard payload when the template is empty', () => {
    const result = validateWebhook(good)
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ name: 'Orders', events: ['order.paid'], template: null, ratePerMinute: 30, enabled: true }) })
  })

  it('refuses an unknown event, an empty event list and a bad rate', () => {
    expect(validateWebhook({ ...good, events: ['order.exploded'] }).ok).toBe(false)
    expect(validateWebhook({ ...good, events: [] }).ok).toBe(false)
    expect(validateWebhook({ ...good, ratePerMinute: 0 }).ok).toBe(false)
    expect(validateWebhook({ ...good, ratePerMinute: 9999 }).ok).toBe(false)
  })

  it('dedupes events and defaults the rate', () => {
    const result = validateWebhook({ ...good, events: ['order.paid', 'order.paid'], ratePerMinute: undefined })
    expect(result.ok && result.value.events).toEqual(['order.paid'])
    expect(result.ok && result.value.ratePerMinute).toBe(60)
  })

  it('accepts a template with tags inside quotes and refuses a bare tag', () => {
    expect(validateTemplate('{"title": "{{data.title}}", "n": 1}').ok).toBe(true)
    expect(validateTemplate('{"title": {{data.title}}}').ok).toBe(false)
    expect(validateTemplate('not json').ok).toBe(false)
    expect(validateTemplate('x'.repeat(5000)).ok).toBe(false)
  })

  it('caps the nesting of a template', () => {
    const deep = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}'
    expect(validateTemplate(deep).ok).toBe(false)
  })
})

describe('payloads', () => {
  const context = { event: 'content.published', id: 'dlv_1', occurredAt: '2026-10-30T00:00:00.000Z', data: { id: 12, title: 'Spring menu', status: 'published' } }

  it('sends the standard payload with no template', () => {
    const result = renderBody(null, context)
    expect(result).toEqual({ ok: true, value: JSON.stringify(context) })
  })

  it('fills merge tags, and a tag alone keeps its type', () => {
    const result = renderBody('{"title": "{{data.title}}", "id": "{{data.id}}", "raw": "{{data.id}}", "event": "{{event}}", "missing": "{{data.nope}}", "text": "Hi {{data.title}}!"}', context)
    expect(result.ok).toBe(true)
    if (result.ok) expect(JSON.parse(result.value)).toEqual({ title: 'Spring menu', id: 12, raw: 12, event: 'content.published', missing: null, text: 'Hi Spring menu!' })
  })

  it('refuses a body over the size limit', () => {
    const big = { event: 'x', id: 'y', occurredAt: 'z', data: { title: 'a'.repeat(MAX_PAYLOAD_BYTES + 10) } }
    expect(renderBody(null, big).ok).toBe(false)
  })

  it('keeps only the allowlisted fields of an event', () => {
    const picked = pickEventFields('user.registered', { id: 4, email: 'a@b.c', passwordHash: 'x', createdAt: 'd' })
    expect(picked).toEqual({ id: 4, createdAt: 'd' })
  })

  it('lists every event once', () => {
    expect(new Set(WEBHOOK_EVENTS).size).toBe(WEBHOOK_EVENTS.length)
  })
})

describe('signing', () => {
  const secret = 'whsec_test'

  it('produces the header the documentation describes, matching HMAC-SHA256 of "<t>.<body>"', async () => {
    const body = '{"event":"order.paid"}'
    const header = await signatureHeader(secret, 1_800_000_000, body)
    const expected = createHmac('sha256', secret).update(`1800000000.${body}`).digest('hex')
    expect(header).toBe(`t=1800000000,v1=${expected}`)
  })

  it('verifies a fresh signature and refuses tampering, a wrong secret and an old timestamp', async () => {
    const now = 1_800_000_000
    const body = '{"a":1}'
    const header = await signatureHeader(secret, now, body)
    expect(await verifySignature(secret, header, body, now)).toBe(true)
    expect(await verifySignature(secret, header, '{"a":2}', now)).toBe(false)
    expect(await verifySignature('other', header, body, now)).toBe(false)
    expect(await verifySignature(secret, header, body, now + 301)).toBe(false)
    expect(await verifySignature(secret, 'garbage', body, now)).toBe(false)
  })

  it('makes secrets with a prefix and 64 hex characters, all different', () => {
    const a = newSigningSecret()
    const b = newSigningSecret()
    expect(a).toMatch(/^whsec_[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe('retries', () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0)
  it('waits longer after each failure and stops after the last attempt', () => {
    expect(nextAttemptAt(1, now)).toBe(new Date(now + 60_000).toISOString())
    expect(nextAttemptAt(2, now)).toBe(new Date(now + 300_000).toISOString())
    expect(nextAttemptAt(5, now)).toBe(new Date(now + 21_600_000).toISOString())
    expect(nextAttemptAt(MAX_ATTEMPTS, now)).toBeNull()
  })
})

describe('developer guide section', () => {
  it('documents the header, the signature rule and the three languages', () => {
    const md = webhookSectionMarkdown()
    expect(md).toContain('X-Engage-Signature')
    expect(md).toContain('verifyEngageWebhook')
    expect(md).toContain('verify_engage_webhook')
    expect(md).toContain('hash_equals')
    expect(md).toContain('`order.paid`')
    expect(md).not.toMatch(/whsec_[0-9a-f]{8}/)
  })

  it('the guide holds no secrets and names the site', () => {
    const guide = buildWebhookGuideMarkdown('Acme', '2026-10-30')
    expect(guide.startsWith('# Acme: webhooks guide')).toBe(true)
    expect(guide).not.toMatch(/whsec_/)
  })

  it('turns the section into HTML with tables and code, escaping every value', () => {
    const html = markdownSectionToHtml(webhookSectionMarkdown())
    expect(html).toContain('<table>')
    expect(html).toContain('<pre><code>')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;unix seconds&gt;')
  })
})
