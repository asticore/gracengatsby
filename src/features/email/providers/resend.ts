import type { EmailAdapter } from '../types'

import { attemptSend, describeHttpFailure, formatSender } from './http'

export type ResendConfig = { apiKey: string }

/** https://resend.com/docs/api-reference/emails/send-email */
export const sendViaResend: EmailAdapter<ResendConfig> = (message, config) =>
  attemptSend(async () => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formatSender(message.fromEmail, message.fromName),
        to: message.to,
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    const result = (await response.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: result.id }
  })
