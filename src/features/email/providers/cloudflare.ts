import type { EmailAdapter } from '../types'

import { attemptSend, describeHttpFailure } from './http'

export type CloudflareConfig = { apiToken: string; accountId: string }

/**
 * Cloudflare's account-level email send endpoint, reached over the normal REST
 * API with an account API token.
 *
 * Cloudflare also offers a Worker-native send binding, but that needs a
 * `send_email` binding declared in wrangler.jsonc against a pre-verified
 * destination address, which is deployment configuration rather than something
 * an operator can set from this screen. The REST call is the path that a token
 * and an account ID typed into the admin can actually use, so that is what this
 * adapter speaks. A 404 here almost always means email sending is not enabled
 * on the account rather than a wrong account ID.
 */
export const sendViaCloudflare: EmailAdapter<CloudflareConfig> = (message, config) =>
  attemptSend(async () => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/email/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: message.to.map((email) => ({ email })) }],
          from: {
            email: message.fromEmail,
            ...(message.fromName ? { name: message.fromName } : {}),
          },
          ...(message.replyTo ? { reply_to: { email: message.replyTo } } : {}),
          subject: message.subject,
          content: [
            ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
            ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
          ],
        }),
      },
    )

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    // The REST API wraps every answer in { success, errors, result } and can
    // report failure inside a 200, so success is read from the envelope.
    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean
      errors?: { message?: string }[]
      result?: { id?: string }
    }

    if (result.success === false) {
      const reason = (result.errors ?? []).map((entry) => entry?.message).filter(Boolean).join('; ')
      return { ok: false, error: reason || 'Cloudflare refused the message without giving a reason.' }
    }

    return { ok: true, id: result.result?.id }
  })
