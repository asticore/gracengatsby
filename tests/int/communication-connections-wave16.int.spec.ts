// @vitest-environment node
// Wave 16: provider keys on Integrations, default and fallback sending, the new Brevo and Mandrill
// providers, the copy rule behind the migration, the connection summary and text messaging. No database.
import { describe, expect, it, vi } from 'vitest'

import { COMMUNICATIONS_COLUMNS, COPY_PAIRS, decideCopy } from '@/features/email/connectionMigrate'
import { mergeConnections } from '@/features/email/connections'
import { summariseProviderState } from '@/features/email/providerState'
import { isTransientFailure, planAttempts, sendWithFailover } from '@/features/email/failover'
import { buildBrevoBody, parseBrevoSuccess } from '@/features/email/providers/brevo'
import { buildMandrillBody, parseMandrillResults } from '@/features/email/providers/mandrill'
import { resolveProvider } from '@/features/email/providers'
import type { EmailSettingsDoc, OutgoingEmail } from '@/features/email/types'
import { buildTwilioRequest, isValidPhone, parseTwilioResponse, resolveTwilio } from '@/features/sms/twilio'

const message: OutgoingEmail = {
  to: ['ana@example.test'],
  subject: 'Hello',
  text: 'Plain body',
  html: '<p>Hello</p>',
  fromEmail: 'hello@example.test',
  fromName: 'Site',
  replyTo: 'help@example.test',
}

const ok = (id: string) => vi.fn(async () => ({ ok: true, id }))
const transient = () => vi.fn(async () => ({ ok: false, error: 'Could not reach the email provider: ECONNRESET' }))
const refused = (status: number) => vi.fn(async () => ({ ok: false, error: 'Rejected', status }))

describe('mergeConnections: new location first, old fields only when blank', () => {
  it('uses the saved Integrations key over an old Email settings key', () => {
    const merged = mergeConnections(
      { resend: { apiKey: 're_new' } },
      { resend: { apiKey: 're_old' } } as EmailSettingsDoc,
    )
    expect(merged.resend?.apiKey).toBe('re_new')
  })

  it('falls back to the old key when the new one is blank', () => {
    const merged = mergeConnections({ resend: { apiKey: '  ' } }, { resend: { apiKey: 're_old' } } as EmailSettingsDoc)
    expect(merged.resend?.apiKey).toBe('re_old')
  })

  it('takes the default provider from Integrations, else the old provider', () => {
    expect(mergeConnections({ defaultProvider: 'brevo' }, { provider: 'resend' } as EmailSettingsDoc).provider).toBe('brevo')
    expect(mergeConnections({}, { provider: 'resend' } as EmailSettingsDoc).provider).toBe('resend')
    expect(mergeConnections(null, null).provider).toBeNull()
  })

  it('treats fallback "none" as no fallback', () => {
    expect(mergeConnections({ fallbackProvider: 'none' }, null).fallbackProvider).toBeNull()
    expect(mergeConnections({ fallbackProvider: 'mandrill' }, null).fallbackProvider).toBe('mandrill')
  })

  it('keeps the sender details from the Email settings global', () => {
    const merged = mergeConnections({ defaultProvider: 'resend' }, {
      fromEmail: 'hello@example.test',
      fromName: 'Site',
      testing: { testRecipient: 'me@example.test' },
    } as EmailSettingsDoc)
    expect(merged.fromEmail).toBe('hello@example.test')
    expect(merged.fromName).toBe('Site')
    expect(merged.testing?.testRecipient).toBe('me@example.test')
  })
})

describe('copy rule used by the migration', () => {
  it('copies only into a blank column from a filled source', () => {
    expect(decideCopy(null, 're_old')).toBe('re_old')
    expect(decideCopy('', 're_old')).toBe('re_old')
    expect(decideCopy('   ', 're_old')).toBe('re_old')
  })

  it('never overwrites a saved value, and never copies a blank one', () => {
    expect(decideCopy('re_new', 're_old')).toBeNull()
    expect(decideCopy(null, null)).toBeNull()
    expect(decideCopy(null, '   ')).toBeNull()
    expect(decideCopy(undefined, undefined)).toBeNull()
  })

  it('copies encrypted values unchanged (no re-encryption)', () => {
    expect(decideCopy(null, 'enc:v1:aa:bb:cc')).toBe('enc:v1:aa:bb:cc')
  })

  it('every copy target is a column the communications group adds', () => {
    for (const pair of COPY_PAIRS) expect(COMMUNICATIONS_COLUMNS).toContain(pair.to)
    expect(new Set(COMMUNICATIONS_COLUMNS).size).toBe(COMMUNICATIONS_COLUMNS.length)
  })
})

describe('new providers', () => {
  it('Brevo body carries sender, recipients, both bodies and reply-to', () => {
    const body = buildBrevoBody(message) as Record<string, unknown>
    expect(body.sender).toEqual({ email: 'hello@example.test', name: 'Site' })
    expect(body.to).toEqual([{ email: 'ana@example.test' }])
    expect(body.htmlContent).toBe('<p>Hello</p>')
    expect(body.textContent).toBe('Plain body')
    expect(body.replyTo).toEqual({ email: 'help@example.test' })
  })

  it('Brevo reads messageId on success and nothing otherwise', () => {
    expect(parseBrevoSuccess({ messageId: '<abc@smtp-relay>' })).toBe('<abc@smtp-relay>')
    expect(parseBrevoSuccess({})).toBeUndefined()
    expect(parseBrevoSuccess(null)).toBeUndefined()
  })

  it('Mandrill puts the key in the body and recipients as type to', () => {
    const body = buildMandrillBody(message, 'md-key') as { key: string; message: Record<string, unknown> }
    expect(body.key).toBe('md-key')
    expect(body.message.from_email).toBe('hello@example.test')
    expect(body.message.to).toEqual([{ email: 'ana@example.test', type: 'to' }])
    expect(body.message.headers).toEqual({ 'Reply-To': 'help@example.test' })
  })

  it('Mandrill accepts sent/queued/scheduled and reports a rejection reason', () => {
    expect(parseMandrillResults([{ status: 'sent', _id: 'm1' }])).toEqual({ ok: true, id: 'm1' })
    expect(parseMandrillResults([{ status: 'queued', _id: 'm2' }]).ok).toBe(true)
    const rejected = parseMandrillResults([{ status: 'rejected', reject_reason: 'hard-bounce' }])
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toContain('hard-bounce')
    expect(parseMandrillResults([]).ok).toBe(false)
  })

  it('a missing Brevo or Mandrill key is reported by name, not sent', () => {
    expect(resolveProvider('brevo', {})).toEqual({ send: null, missing: ['Brevo API key'] })
    expect(resolveProvider('mandrill', {})).toEqual({ send: null, missing: ['Mandrill API key'] })
    expect(resolveProvider('brevo', { brevo: { apiKey: 'xkey' } }).send).not.toBeNull()
  })
})

describe('default and fallback sending (fake senders)', () => {
  it('a transient failure (unreachable) moves on to the fallback', async () => {
    const primary = transient()
    const backup = ok('b-1')
    const result = await sendWithFailover(message, [
      { provider: 'resend', send: primary },
      { provider: 'mandrill', send: backup },
    ])
    expect(primary).toHaveBeenCalledTimes(1)
    expect(backup).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, provider: 'mandrill', id: 'b-1' })
  })

  it('a rate limit or server error also moves on', async () => {
    const backup = ok('b-2')
    const result = await sendWithFailover(message, [
      { provider: 'resend', send: refused(429) },
      { provider: 'brevo', send: backup },
    ])
    expect(result.provider).toBe('brevo')
    const serverError = ok('b-3')
    const second = await sendWithFailover(message, [
      { provider: 'resend', send: refused(503) },
      { provider: 'brevo', send: serverError },
    ])
    expect(second.ok).toBe(true)
  })

  it('a refusal that would repeat everywhere (401) does NOT try the fallback', async () => {
    const backup = ok('never')
    const result = await sendWithFailover(message, [
      { provider: 'resend', send: refused(401) },
      { provider: 'brevo', send: backup },
    ])
    expect(backup).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, reason: 'provider-rejected', provider: 'resend', status: 401 })
  })

  it('the default succeeding never touches the fallback', async () => {
    const backup = ok('never')
    const result = await sendWithFailover(message, [
      { provider: 'resend', send: ok('r-1') },
      { provider: 'brevo', send: backup },
    ])
    expect(backup).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, provider: 'resend', id: 'r-1' })
  })

  it('when both fail transiently the fallback failure is what is reported', async () => {
    const result = await sendWithFailover(message, [
      { provider: 'resend', send: transient() },
      { provider: 'brevo', send: refused(400) },
    ])
    expect(result).toMatchObject({ ok: false, provider: 'brevo', status: 400 })
  })

  it('a send function that throws counts as transient and does not escape', async () => {
    const backup = ok('after-throw')
    const result = await sendWithFailover(message, [
      { provider: 'resend', send: vi.fn(async () => { throw new Error('boom') }) },
      { provider: 'sendgrid', send: backup },
    ])
    expect(result).toEqual({ ok: true, provider: 'sendgrid', id: 'after-throw' })
  })

  it('isTransientFailure: no status, 429 and 5xx are transient; 4xx is not', () => {
    expect(isTransientFailure({ ok: false, error: 'x' })).toBe(true)
    expect(isTransientFailure({ ok: false, status: 429 })).toBe(true)
    expect(isTransientFailure({ ok: false, status: 502 })).toBe(true)
    expect(isTransientFailure({ ok: false, status: 422 })).toBe(false)
    expect(isTransientFailure({ ok: true })).toBe(false)
  })

  it('planAttempts: default first, fallback only when different and connected', () => {
    const both = planAttempts({
      provider: 'resend',
      fallbackProvider: 'brevo',
      resend: { apiKey: 're_x' },
      brevo: { apiKey: 'xkey' },
    })
    expect(both.attempts.map((a) => a.provider)).toEqual(['resend', 'brevo'])

    const unconnectedFallback = planAttempts({ provider: 'resend', fallbackProvider: 'brevo', resend: { apiKey: 're_x' } })
    expect(unconnectedFallback.attempts.map((a) => a.provider)).toEqual(['resend'])

    const sameAsDefault = planAttempts({ provider: 'resend', fallbackProvider: 'resend', resend: { apiKey: 're_x' } })
    expect(sameAsDefault.attempts.map((a) => a.provider)).toEqual(['resend'])
  })

  it('planAttempts: no connected default means nothing is sent, and the blanks are named', () => {
    const plan = planAttempts({ provider: 'mandrill', fallbackProvider: 'brevo', brevo: { apiKey: 'xkey' } })
    expect(plan.attempts).toEqual([])
    expect(plan.missing).toEqual(['Mandrill API key'])
    expect(planAttempts({ provider: '' }).attempts).toEqual([])
  })

  it('falls back to the old settings for a provider whose new key is blank', () => {
    const merged = mergeConnections({ defaultProvider: 'sendgrid' }, { sendgrid: { apiKey: 'SG.old' } } as EmailSettingsDoc)
    const plan = planAttempts(merged)
    expect(plan.attempts.map((a) => a.provider)).toEqual(['sendgrid'])
  })
})

describe("provider state summary", () => {
  it('marks the default and fallback and reports email connected only when the default is', () => {
    const summary = summariseProviderState({
      provider: 'brevo',
      fallbackProvider: 'resend',
      brevo: { apiKey: 'xkey' },
      resend: { apiKey: 're_x' },
    })
    expect(summary.emailConnected).toBe(true)
    expect(summary.defaultLabel).toBe('Brevo')
    expect(summary.fallbackLabel).toBe('Resend')
    expect(summary.providers.find((p) => p.key === 'brevo')).toMatchObject({ connected: true, isDefault: true })
    expect(summary.providers.find((p) => p.key === 'resend')).toMatchObject({ connected: true, isFallback: true })
    expect(summary.providers.find((p) => p.key === 'sendgrid')).toMatchObject({ connected: false, isDefault: false })
  })

  it('a fresh install reports not connected and never includes a key', () => {
    const summary = summariseProviderState({})
    expect(summary.emailConnected).toBe(false)
    expect(summary.defaultLabel).toBeNull()
    expect(JSON.stringify(summary)).not.toContain('apiKey')
  })

  it('a key of its own never appears in the summary text', () => {
    const summary = summariseProviderState({ provider: 'resend', resend: { apiKey: 're_secret_value' } })
    expect(JSON.stringify(summary)).not.toContain('re_secret_value')
  })
})

describe('text messaging (Twilio)', () => {
  it('needs an account SID, auth token and a sender', () => {
    expect(resolveTwilio({}).missing).toEqual(['Twilio account SID', 'Twilio auth token', 'Twilio a From number or messaging service SID'])
    expect(resolveTwilio({ twilio: { accountSid: 'AC1', authToken: 't', fromNumber: '+61400000000' } }).config).not.toBeNull()
  })

  it('prefers the messaging service over the From number', () => {
    const { config } = resolveTwilio({
      twilio: { accountSid: 'AC1', authToken: 't', fromNumber: '+61400000000', messagingServiceSid: 'MG1' },
    })
    const request = buildTwilioRequest(config, '+61411111111', 'Hi')
    expect(request.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json')
    expect(request.form).toContain('MessagingServiceSid=MG1')
    expect(request.form).not.toContain('From=')
    expect(request.headers.Authorization).toBe(`Basic ${btoa('AC1:t')}`)
  })

  it('uses the From number when there is no messaging service', () => {
    const { config } = resolveTwilio({ twilio: { accountSid: 'AC1', authToken: 't', fromNumber: '+61400000000' } })
    const request = buildTwilioRequest(config, '+61411111111', 'Hi there')
    expect(request.form).toContain('From=%2B61400000000')
    expect(request.form).toContain('Body=Hi+there')
  })

  it('phone numbers must be in international format', () => {
    expect(isValidPhone('+61400000000')).toBe(true)
    expect(isValidPhone('0400000000')).toBe(false)
    expect(isValidPhone('+0123')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })

  it('a 201 with a sid is a success; an error body is reported with its message', () => {
    expect(parseTwilioResponse(201, { sid: 'SM123' })).toEqual({ ok: true, id: 'SM123' })
    expect(parseTwilioResponse(400, { message: 'Invalid To number', code: 21211 })).toEqual({
      ok: false,
      error: 'Invalid To number (error 21211)',
    })
    expect(parseTwilioResponse(500, null)).toEqual({ ok: false, error: 'Twilio returned 500' })
  })
})
