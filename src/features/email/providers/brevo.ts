import type { EmailAdapter, OutgoingEmail, ProviderResponse } from '../types'

import { attemptSend, describeHttpFailure } from './http'

export type BrevoConfig = { apiKey: string }

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

/**
 * The JSON body Brevo's transactional endpoint expects. Pure, so the shape can
 * be checked without a network call. Brevo wants the sender and each recipient
 * as objects, and the reply-to as an object too.
 */
export function buildBrevoBody(message: OutgoingEmail): Record<string, unknown> {
  return {
    sender: {
      email: message.fromEmail,
      ...(message.fromName ? { name: message.fromName } : {}),
    },
    to: message.to.map((email) => ({ email })),
    subject: message.subject,
    ...(message.html ? { htmlContent: message.html } : {}),
    ...(message.text ? { textContent: message.text } : {}),
    ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
  }
}

/** Brevo answers 201 with `{ messageId }` on success. */
export function parseBrevoSuccess(body: unknown): string | undefined {
  const id = (body as { messageId?: unknown } | null)?.messageId
  return typeof id === 'string' ? id : undefined
}

/** https://developers.brevo.com/reference/sendtransacemail */
export const sendViaBrevo: EmailAdapter<BrevoConfig> = (message, config) =>
  attemptSend(async (): Promise<ProviderResponse> => {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildBrevoBody(message)),
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    const parsed: unknown = await response.json().catch((): null => null)
    return { ok: true, id: parseBrevoSuccess(parsed) }
  })