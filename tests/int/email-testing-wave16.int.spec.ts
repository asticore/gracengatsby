import { describe, it, expect } from 'vitest'
import { readEmailTestingSettings, connectionHeadline } from '@/features/email/connectionRead'
import { parseTxtData, parseSpf, parseDmarc, senderDomain, summariseDomain, overallLevel } from '@/features/email/dnsCheck'
import { lookupTxt, checkSenderDomain } from '@/features/email/dnsLookup'
import { BATCH_LIMIT, BATCH_INTERVAL_MS, batchKeys, batchRefusal, chooseRecipient, isKnownKey } from '@/features/email/testRun'
import { sampleValuesFor, TEMPLATE_LABELS, testSubject, TEST_SAMPLE_VALUES } from '@/features/email/testSamples'
import { renderTemplate, templateFrom } from '@/features/email/renderTemplate'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'

const fakeFetch = (handler: (url: string) => Response | Promise<Response>) =>
  ((url: string) => Promise.resolve(handler(url))) as unknown as typeof fetch

const dnsAnswer = (records: string[]) =>
  new Response(JSON.stringify({ Status: 0, Answer: records.map((data) => ({ type: 16, data })) }), { status: 200 })

describe('connection reading', () => {
  const engineWith = (docs: Record<string, unknown>) => ({
    findGlobal: async (args: { slug: string }) => docs[args.slug] ?? null,
  })

  it('reads the default provider and keys from the Integrations communications group', async () => {
    const result = await readEmailTestingSettings(
      engineWith({
        integrations: { communications: { defaultProvider: 'resend', resend: { apiKey: 're_123' } } },
        'email-settings': { fromEmail: 'hello@example.com', testing: { testRecipient: 'test@example.com' } },
      }),
    )
    expect(result.summary.emailConnected).toBe(true)
    expect(result.summary.defaultLabel).toBe('Resend')
    expect(result.fromEmail).toBe('hello@example.com')
    expect(result.testRecipient).toBe('test@example.com')
  })

  it('falls back to the legacy Email settings keys when the new place is blank', async () => {
    const result = await readEmailTestingSettings(
      engineWith({ 'email-settings': { provider: 'sendgrid', sendgrid: { apiKey: 'SG.x' } } }),
    )
    expect(result.summary.emailConnected).toBe(true)
    expect(result.summary.providers.find((p) => p.key === 'sendgrid')?.connected).toBe(true)
  })

  it('lists the blank fields for a default provider that is not fully connected', async () => {
    const result = await readEmailTestingSettings(
      engineWith({
        integrations: { communications: { defaultProvider: 'ses-api', sesApi: { accessKeyId: 'AKIA' } } },
      }),
    )
    const ses = result.summary.providers.find((p) => p.key === 'ses-api')
    expect(result.summary.emailConnected).toBe(false)
    expect(ses?.missing).toEqual(expect.arrayContaining(['Amazon SES secret access key', 'Amazon SES region']))
    expect(connectionHeadline(result.summary)).toContain('not fully connected')
  })

  it('marks the fallback provider', async () => {
    const result = await readEmailTestingSettings(
      engineWith({
        integrations: {
          communications: { defaultProvider: 'resend', fallbackProvider: 'brevo', resend: { apiKey: 'a' }, brevo: { apiKey: 'b' } },
        },
      }),
    )
    expect(result.summary.fallbackLabel).toBe('Brevo')
    expect(result.summary.providers.find((p) => p.key === 'brevo')?.isFallback).toBe(true)
  })

  it('reports that nothing is connected when no default is chosen', async () => {
    const result = await readEmailTestingSettings(engineWith({}))
    expect(result.summary.emailConnected).toBe(false)
    expect(result.summary.defaultLabel).toBeNull()
    expect(connectionHeadline(result.summary)).toContain('No email provider')
  })

  it('reports text messages only when Twilio has what it needs', async () => {
    const none = await readEmailTestingSettings(engineWith({}))
    expect(none.smsConnected).toBe(false)
    const twilio = await readEmailTestingSettings(
      engineWith({
        integrations: {
          communications: {
            sms: { provider: 'twilio', twilio: { accountSid: 'AC1', authToken: 'tok', fromNumber: '+15550001111' } },
          },
        },
      }),
    )
    expect(twilio.smsConnected).toBe(true)
    expect(twilio.smsLabel).toBe('Twilio')
  })

  it('never puts a key value into what the screen receives', async () => {
    const secret = 'sk_live_very_secret_value_42'
    const result = await readEmailTestingSettings(
      engineWith({ integrations: { communications: { defaultProvider: 'sendgrid', sendgrid: { apiKey: secret } } } }),
    )
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})

describe('dnsCheck parsers', () => {
  it('joins quoted TXT pieces with nothing between them', () => {
    expect(parseTxtData('"v=spf1 " "include:amazonses.com ~all"')).toBe('v=spf1 include:amazonses.com ~all')
    expect(parseTxtData('v=DMARC1; p=none')).toBe('v=DMARC1; p=none')
  })

  it('reads the domain out of an address and rejects unusable ones', () => {
    expect(senderDomain('Hello@Example.COM ')).toBe('example.com')
    expect(senderDomain('no-at-sign')).toBeNull()
    expect(senderDomain('a@localhost')).toBeNull()
    expect(senderDomain(null)).toBeNull()
  })

  it('reports a missing SPF record', () => {
    expect(parseSpf([], 'resend').level).toBe('missing')
  })

  it('accepts an SPF record that names the provider', () => {
    const spf = parseSpf(['"v=spf1 include:amazonses.com ~all"'], 'resend')
    expect(spf.level).toBe('good')
    expect(spf.record).toContain('amazonses.com')
  })

  it('flags an SPF record that does not name the provider', () => {
    const spf = parseSpf(['v=spf1 include:_spf.google.com ~all'], 'postmark')
    expect(spf.level).toBe('needs-work')
    expect(spf.message).toContain('spf.mtasv.net')
  })

  it('accepts any SPF record when the provider is unknown', () => {
    expect(parseSpf(['v=spf1 -all'], null).level).toBe('good')
  })

  it('flags two SPF records', () => {
    const spf = parseSpf(['v=spf1 include:amazonses.com ~all', 'v=spf1 -all'], 'resend')
    expect(spf.level).toBe('needs-work')
    expect(spf.message).toContain('More than one SPF record')
  })

  it('ignores TXT records that are not SPF', () => {
    expect(parseSpf(['google-site-verification=abc'], 'resend').level).toBe('missing')
  })

  it('reads the DMARC policy', () => {
    expect(parseDmarc([]).level).toBe('missing')
    const none = parseDmarc(['v=DMARC1; p=none; rua=mailto:x@example.com'])
    expect(none.level).toBe('info')
    expect(none.policy).toBe('none')
    const quarantine = parseDmarc(['v=DMARC1; p=quarantine'])
    expect(quarantine.level).toBe('good')
    expect(quarantine.policy).toBe('quarantine')
    const reject = parseDmarc(['"v=DMARC1; p=reject"'])
    expect(reject.level).toBe('good')
    expect(reject.policy).toBe('reject')
  })

  it('flags a DMARC record with no valid policy', () => {
    const dmarc = parseDmarc(['v=DMARC1; p=bogus'])
    expect(dmarc.level).toBe('needs-work')
    expect(dmarc.policy).toBeNull()
  })

  it('combines SPF and DMARC into the worst level, with DKIM as advice only', () => {
    expect(overallLevel(['good', 'good'])).toBe('good')
    expect(overallLevel(['good', 'missing'])).toBe('missing')
    expect(overallLevel(['needs-work', 'info'])).toBe('needs-work')
    const report = summariseDomain('example.com', ['v=spf1 include:amazonses.com -all'], ['v=DMARC1; p=reject'], 'resend')
    expect(report.overall).toBe('good')
    expect(report.dkim.level).toBe('info')
    expect(report.dkim.message).toContain('Resend')
  })
})

describe('dnsLookup', () => {
  it('returns the TXT records from a DNS-over-HTTPS answer', async () => {
    const result = await lookupTxt('example.com', fakeFetch(() => dnsAnswer(['"v=spf1 -all"'])))
    expect(result).toEqual({ ok: true, records: ['"v=spf1 -all"'] })
  })

  it('treats no records as a real answer, not a failure', async () => {
    const result = await lookupTxt('example.com', fakeFetch(() => new Response(JSON.stringify({ Status: 3 }), { status: 200 })))
    expect(result.ok).toBe(true)
    expect(result.records).toEqual([])
  })

  it('reports a bad HTTP status without throwing', async () => {
    const result = await lookupTxt('example.com', fakeFetch(() => new Response('nope', { status: 503 })))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('503')
  })

  it('reports a network error without throwing', async () => {
    const result = await lookupTxt(
      'example.com',
      (() => Promise.reject(new Error('socket hang up'))) as unknown as typeof fetch,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('The DNS lookup could not be completed.')
  })

  it('reports a timeout in plain words', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const result = await lookupTxt('example.com', (() => Promise.reject(abort)) as unknown as typeof fetch)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('took too long')
  })

  it('asks for the domain and for _dmarc.<domain>, and says so when a lookup fails', async () => {
    const asked: string[] = []
    const report = await checkSenderDomain(
      'example.com',
      'resend',
      fakeFetch((url) => {
        asked.push(url)
        if (url.includes('_dmarc')) return new Response('down', { status: 500 })
        return dnsAnswer(['v=spf1 include:amazonses.com ~all'])
      }),
    )
    expect(asked.some((u) => u.includes('name=_dmarc.example.com'))).toBe(true)
    expect(report.spf.level).toBe('good')
    expect(report.dmarc.level).toBe('info')
    expect(report.lookupError).toContain('500')
    expect(report.overall).toBe('info')
  })
})

describe('testRun rules', () => {
  it('refuses a second batch inside the interval and allows one after it', () => {
    expect(batchRefusal(undefined, 1000)).toBeNull()
    const refused = batchRefusal(1000, 1000 + BATCH_INTERVAL_MS - 1000)
    expect(refused?.status).toBe(429)
    expect(batchRefusal(1000, 1000 + BATCH_INTERVAL_MS)).toBeNull()
  })

  it('caps a batch and keeps the order', () => {
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`)
    expect(batchKeys(many)).toHaveLength(BATCH_LIMIT)
    expect(batchKeys(many)[0]).toBe('t0')
    expect(batchKeys(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('only accepts known template keys', () => {
    expect(isKnownKey('accountReset', ['accountReset'])).toBe(true)
    expect(isKnownKey('hack', ['accountReset'])).toBe(false)
    expect(isKnownKey(42, ['accountReset'])).toBe(false)
  })

  it('sends tests to the admin or the test recipient only', () => {
    expect(chooseRecipient('', 'admin@x.com', 'test@x.com')).toEqual({ to: 'test@x.com' })
    expect(chooseRecipient(undefined, 'admin@x.com', null)).toEqual({ to: 'admin@x.com' })
    expect(chooseRecipient('ADMIN@x.com', 'admin@x.com', null)).toEqual({ to: 'ADMIN@x.com' })
    expect(chooseRecipient('test@x.com', 'admin@x.com', 'test@x.com')).toEqual({ to: 'test@x.com' })
    expect('error' in chooseRecipient('victim@elsewhere.com', 'admin@x.com', 'test@x.com')).toBe(true)
    expect('error' in chooseRecipient('not-an-email', 'admin@x.com', null)).toBe(true)
    expect('error' in chooseRecipient('', null, null)).toBe(true)
  })
})

describe('test samples', () => {
  it('has a plain-English label for every template', () => {
    for (const key of Object.keys(EMAIL_TEMPLATE_DEFAULTS)) {
      expect(TEMPLATE_LABELS[key], key).toBeTruthy()
    }
  })

  it('renders every template with its sample data and leaves no tag unfilled', () => {
    for (const key of Object.keys(EMAIL_TEMPLATE_DEFAULTS)) {
      const rendered = renderTemplate(
        templateFrom(null, key as keyof typeof EMAIL_TEMPLATE_DEFAULTS),
        sampleValuesFor(key),
      )
      expect(rendered.subject.length, key).toBeGreaterThan(0)
      expect(rendered.text, key).not.toMatch(/\{\{/)
      expect(rendered.html, key).not.toMatch(/\{\{/)
    }
  })

  it('gives a generic sample to a template with no specific one', () => {
    expect(sampleValuesFor('someNewTemplate')).toEqual(expect.objectContaining({ name: expect.any(String) }))
    expect(TEST_SAMPLE_VALUES.accountReset).toBeTruthy()
  })

  it('marks test subjects so they cannot be taken for real mail', () => {
    expect(testSubject('Reset your password')).toBe('[Test] Reset your password')
  })
})
