import type { EmailAdapter } from '../types'

import { attemptSend, describeHttpFailure, formatSender } from './http'

export type MailgunConfig = { apiKey: string; domain: string; region?: string | null }

/**
 * https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Messages/
 *
 * Mailgun's messages endpoint takes form encoding, not JSON, and authenticates
 * with HTTP Basic where the username is the literal string `api`. The EU and US
 * regions are separate installations with separate keys - a US key against the
 * EU host returns a 401 that reads like a bad key, which is why the region is a
 * stored setting rather than a guess.
 */
export const sendViaMailgun: EmailAdapter<MailgunConfig> = (message, config) =>
  attemptSend(async () => {
    const host = config.region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net'

    const form = new URLSearchParams()
    form.set('from', formatSender(message.fromEmail, message.fromName))
    form.set('to', message.to.join(','))
    form.set('subject', message.subject)
    if (message.html) form.set('html', message.html)
    if (message.text) form.set('text', message.text)
    if (message.replyTo) form.set('h:Reply-To', message.replyTo)

    const response = await fetch(`https://${host}/v3/${encodeURIComponent(config.domain)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`api:${config.apiKey}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    const result = (await response.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: result.id }
  })
