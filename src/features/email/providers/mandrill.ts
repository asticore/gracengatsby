import type { EmailAdapter, OutgoingEmail, ProviderResponse } from '../types'

import { attemptSend, describeHttpFailure } from './http'

export type MandrillConfig = { apiKey: string }

export const MANDRILL_ENDPOINT = 'https://mandrillapp.com/api/1.0/messages/send.json'

/**
 * Mandrill (Mailchimp Transactional) takes the API key in the JSON body, not a
 * header. Recipients go in `to` with type 'to', and a reply-to is sent as a
 * custom header.
 */
export function buildMandrillBody(message: OutgoingEmail, apiKey: string): Record<string, unknown> {
  return {
    key: apiKey,
    message: {
      subject: message.subject,
      from_email: message.fromEmail,
      ...(message.fromName ? { from_name: message.fromName } : {}),
      to: message.to.map((email) => ({ email, type: 'to' })),
      ...(message.html ? { html: message.html } : {}),
      ...(message.text ? { text: message.text } : {}),
      ...(message.replyTo ? { headers: { 'Reply-To': message.replyTo } } : {}),
    },
  }
}

const ACCEPTED = new Set(['sent', 'queued', 'scheduled'])

/**
 * Mandrill answers 200 with one result per recipient, and a rejected recipient
 * is still a 200. Only an accepted status counts as sent; the reason is kept
 * from the first rejected one so the operator sees what Mandrill said.
 */
export function parseMandrillResults(body: unknown): ProviderResponse {
  if (!Array.isArray(body) || body.length === 0) {
    return { ok: false, error: 'Mandrill returned no result for the message.' }
  }
  const first = body[0] as { status?: unknown; _id?: unknown; reject_reason?: unknown }
  const status = typeof first.status === 'string' ? first.status : ''
  if (ACCEPTED.has(status)) {
    return { ok: true, id: typeof first._id === 'string' ? first._id : undefined }
  }
  const reason = typeof first.reject_reason === 'string' && first.reject_reason ? first.reject_reason : status || 'unknown'
  return { ok: false, error: `Mandrill did not accept the message: ${reason}` }
}

/** https://mailchimp.com/developer/transactional/api/messages/send-new-message/ */
export const sendViaMandrill: EmailAdapter<MandrillConfig> = (message, config) =>
  attemptSend(async (): Promise<ProviderResponse> => {
    const response = await fetch(MANDRILL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildMandrillBody(message, config.apiKey)),
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    const parsed: unknown = await response.json().catch((): null => null)
    return parseMandrillResults(parsed)
  })
