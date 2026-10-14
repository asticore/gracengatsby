import { describe, expect, it } from 'vitest'

import { buildLogRow, BODY_CAP, clip, clipBody, NOT_STORED, resendRefusal, RESEND_INTERVAL_MS, retentionCutoff, statusFor, EMAIL_LOG_RETENTION_DAYS } from '@/features/email/emailLog'

const sent = { ok: true, provider: 'resend' as const, id: 'msg_1' }
const failed = { ok: false, reason: 'provider-rejected' as const, provider: 'resend' as const, error: 'Rejected', status: 422 }

describe('statusFor', () => {
  it('maps the send outcomes to log statuses', () => {
    expect(statusFor(sent)).toBe('sent')
    expect(statusFor(failed)).toBe('failed')
    expect(statusFor({ ok: false, reason: 'not-configured' })).toBe('skipped')
    expect(statusFor({ ok: false, reason: 'invalid-message' })).toBe('skipped')
    expect(statusFor({ ok: false, reason: 'unsupported-provider' })).toBe('skipped')
  })

  it('does not log when email is switched off', () => {
    expect(statusFor({ ok: false, reason: 'disabled' })).toBeNull()
  })
})

describe('buildLogRow', () => {
  it('returns null when the send should not be logged', () => {
    expect(buildLogRow({ to: 'a@example.com', subject: 'Hi', text: 'Body' }, { ok: false, reason: 'disabled' })).toBeNull()
  })

  it('records a sent message with its body, template and provider', () => {
    const row = buildLogRow({ to: 'a@example.com', subject: 'Hi', html: '<p>x</p>', text: 'x', template: 'order.completed' }, sent)
    expect(row).toEqual({
      to: 'a@example.com',
      subject: 'Hi',
      template: 'order.completed',
      provider: 'resend',
      status: 'sent',
      error: '',
      html: '<p>x</p>',
      text: 'x',
      resentFrom: null,
    })
  })

  it('defaults the template to other and joins several recipients', () => {
    const row = buildLogRow({ to: ['a@example.com', 'b@example.com'], subject: 'Hi', text: 'x' }, sent)
    expect(row?.template).toBe('other')
    expect(row?.to).toBe('a@example.com, b@example.com')
  })

  it('keeps the error text on a failed send', () => {
    const row = buildLogRow({ to: 'a@example.com', subject: 'Hi', text: 'x' }, failed)
    expect(row?.status).toBe('failed')
    expect(row?.error).toBe('Rejected')
  })

  it('never keeps the body of a reset or welcome email', () => {
    for (const template of ['account.reset', 'account.welcome']) {
      const row = buildLogRow({ to: 'a@example.com', subject: 'Reset', html: '<a>link</a>', text: 'link', template }, sent)
      expect(row?.html).toBe(NOT_STORED)
      expect(row?.text).toBe(NOT_STORED)
    }
  })

  it('stores the resent-from id when given', () => {
    const row = buildLogRow({ to: 'a@example.com', subject: 'Hi', text: 'x', template: 'resend', resentFrom: 7 }, sent)
    expect(row?.resentFrom).toBe(7)
  })
})

describe('clip and clipBody', () => {
  it('leaves short values alone and marks a shortened one', () => {
    expect(clip('abc', 10)).toBe('abc')
    expect(clip('abcdefghij', 6)).toBe('abc...')
    expect(clip(null, 6)).toBe('')
  })

  it('cuts a body to the cap without a marker', () => {
    const long = 'x'.repeat(BODY_CAP + 500)
    expect(clipBody(long)).toHaveLength(BODY_CAP)
    expect(clipBody('short')).toBe('short')
  })
})

describe('retentionCutoff', () => {
  it('is the retention window before now, in ISO time', () => {
    const now = new Date('2026-10-14T00:00:00.000Z')
    expect(EMAIL_LOG_RETENTION_DAYS).toBe(90)
    expect(retentionCutoff(now)).toBe('2026-07-16T00:00:00.000Z')
    expect(retentionCutoff(now, 1)).toBe('2026-10-13T00:00:00.000Z')
  })
})

describe('resendRefusal', () => {
  const now = Date.parse('2026-10-14T10:00:00.000Z')

  it('allows a resend of a stored message', () => {
    expect(resendRefusal({ html: '<p>x</p>', text: 'x' }, null, now)).toBeNull()
  })

  it('refuses a missing entry', () => {
    expect(resendRefusal(null, null, now)?.status).toBe(404)
  })

  it('refuses an entry whose body was not kept', () => {
    const refusal = resendRefusal({ html: NOT_STORED, text: NOT_STORED }, null, now)
    expect(refusal?.status).toBe(409)
  })

  it('refuses an entry with no message at all', () => {
    expect(resendRefusal({ html: '', text: '' }, null, now)?.status).toBe(409)
  })

  it('refuses a body that was cut at the cap', () => {
    expect(resendRefusal({ html: 'x'.repeat(BODY_CAP), text: '' }, null, now)?.status).toBe(409)
  })

  it('refuses a second resend inside the minute', () => {
    const recent = new Date(now - (RESEND_INTERVAL_MS - 20_000)).toISOString()
    const refusal = resendRefusal({ html: '<p>x</p>', text: '' }, recent, now)
    expect(refusal?.status).toBe(429)
    expect(refusal?.error).toContain('20 seconds')
  })

  it('allows a resend once the minute has passed', () => {
    const old = new Date(now - RESEND_INTERVAL_MS - 1000).toISOString()
    expect(resendRefusal({ html: '<p>x</p>', text: '' }, old, now)).toBeNull()
  })
})
