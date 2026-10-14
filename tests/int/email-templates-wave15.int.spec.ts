// @vitest-environment node
// Editable email templates (email-templates global): pure rendering, defaults and fallbacks. No database.
import { describe, expect, it } from 'vitest'

import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { escapeHtml, fillTemplate, renderTemplate, templateFrom, textToHtml } from '@/features/email/renderTemplate'

describe('built-in defaults match the old hard-coded emails', () => {
  it('reset email keeps its text and paragraphs', () => {
    const mail = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.accountReset, {
      minutes: '30',
      link: 'https://example.test/reset/abc',
    })
    expect(mail.subject).toBe('Reset your password')
    expect(mail.text).toBe(
      [
        'Someone asked to reset the password on your account.',
        'Open this link to choose a new one - it works once, and expires in 30 minutes:\nhttps://example.test/reset/abc',
        'If this was not you, ignore this email. Your password has not changed.',
      ].join('\n\n'),
    )
    expect(mail.html).toBe(
      [
        '<p>Someone asked to reset the password on your account.</p>',
        '<p>Open this link to choose a new one - it works once, and expires in 30 minutes:<br />https://example.test/reset/abc</p>',
        '<p>If this was not you, ignore this email. Your password has not changed.</p>',
      ].join('\n'),
    )
  })

  it('already-registered email keeps both links', () => {
    const mail = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.accountAlreadyRegistered, {
      signInLink: 'https://example.test/sign-in',
      resetLink: 'https://example.test/forgot',
    })
    expect(mail.subject).toBe('You already have an account')
    expect(mail.text).toContain('Sign in here:\nhttps://example.test/sign-in')
    expect(mail.text).toContain('Forgotten your password? Reset it here:\nhttps://example.test/forgot')
  })

  it('renewal reminder keeps its subject and body', () => {
    const mail = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.membershipRenewal, {
      tier: 'Gold',
      renewsAt: 'Wed Nov 04 2026',
      days: '3',
    })
    expect(mail.subject).toBe('Your Gold membership renews in 3 day(s)')
    expect(mail.text).toBe('Your Gold membership is due to renew on Wed Nov 04 2026 - that is 3 day(s) away.')
  })

  it('decision email has the note block only when there is a note', () => {
    const values = { reviewerName: 'Ana', verb: 'approved', noun: 'page', title: 'About us', link: 'https://example.test/a' }
    const without = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.approvalDecision, { ...values, note: '' })
    expect(without.subject).toBe('About us was approved')
    expect(without.text).toBe('Ana approved this page: About us.\n\nOpen it here:\nhttps://example.test/a')

    const withNote = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.approvalDecision, {
      ...values,
      note: '\n\nTheir note:\nPlease fix the heading',
    })
    expect(withNote.text).toBe(
      'Ana approved this page: About us.\n\nTheir note:\nPlease fix the heading\n\nOpen it here:\nhttps://example.test/a',
    )
  })

  it('booking confirmation uses the event title in the subject', () => {
    const mail = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.rsvpConfirmation, {
      name: 'Sam',
      eventTitle: 'Summer picnic',
      eventDate: 'Saturday 14 November 2026, 10:00 am',
      guestCount: 2,
    })
    expect(mail.subject).toBe("You're booked: Summer picnic")
    expect(mail.text).toContain('Hi Sam, your booking for Summer picnic is confirmed.')
    expect(mail.text).toContain('When: Saturday 14 November 2026, 10:00 am\nGuests: 2')
  })
})

describe('renderer', () => {
  it('escapes values in HTML but not in plain text', () => {
    const mail = renderTemplate(
      { subject: 'Hi {{name}}', body: 'Hello {{name}} & welcome' },
      { name: '<script>"x"</script>' },
    )
    expect(mail.text).toBe('Hello <script>"x"</script> & welcome')
    expect(mail.html).toBe('<p>Hello &lt;script&gt;&quot;x&quot;&lt;/script&gt; &amp; welcome</p>')
    expect(mail.subject).toBe('Hi <script>"x"</script>')
  })

  it('removes tags it has no value for', () => {
    expect(fillTemplate('Hi {{name}}{{nope}}!', { name: 'Sam' })).toBe('Hi Sam!')
  })

  it('does not fill tags that appear inside a value', () => {
    expect(fillTemplate('Hi {{name}}', { name: '{{link}}' })).toBe('Hi {{link}}')
  })

  it('ignores inherited object keys as tags', () => {
    expect(fillTemplate('x {{constructor}} y', {})).toBe('x  y')
  })

  it('turns blank lines into paragraphs and single lines into breaks', () => {
    expect(textToHtml('one\ntwo\n\nthree')).toBe('<p>one<br />two</p>\n<p>three</p>')
  })

  it('keeps the subject to one line', () => {
    const mail = renderTemplate({ subject: 'Review: {{title}}', body: 'x' }, { title: 'A\r\nB' })
    expect(mail.subject).toBe('Review: A B')
  })

  it('escapes the double quote for attributes', () => {
    expect(escapeHtml('a"b<c>&')).toBe('a&quot;b&lt;c&gt;&amp;')
  })
})

describe('stored wording falls back to the default when blank', () => {
  it('uses the built-in text when nothing is stored', () => {
    expect(templateFrom(null, 'accountWelcome')).toEqual(EMAIL_TEMPLATE_DEFAULTS.accountWelcome)
    expect(templateFrom(undefined, 'accountWelcome')).toEqual(EMAIL_TEMPLATE_DEFAULTS.accountWelcome)
  })

  it('treats whitespace-only fields as blank', () => {
    const stored = { accountWelcome: { subject: '   ', body: '\n \n' } }
    expect(templateFrom(stored, 'accountWelcome')).toEqual(EMAIL_TEMPLATE_DEFAULTS.accountWelcome)
  })

  it('uses a filled subject while keeping the default body', () => {
    const stored = { accountWelcome: { subject: 'Hello there', body: '' } }
    expect(templateFrom(stored, 'accountWelcome')).toEqual({
      subject: 'Hello there',
      body: EMAIL_TEMPLATE_DEFAULTS.accountWelcome.body,
    })
  })

  it('normalises line endings and trims the body', () => {
    const stored = { accountWelcome: { subject: 'Hi', body: 'Line one\r\nLine two\r\n' } }
    expect(templateFrom(stored, 'accountWelcome')).toEqual({ subject: 'Hi', body: 'Line one\nLine two' })
  })
})
