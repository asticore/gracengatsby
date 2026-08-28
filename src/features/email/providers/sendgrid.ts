import type { EmailAdapter } from '../types'

import { attemptSend, describeHttpFailure } from './http'

export type SendGridConfig = { apiKey: string }

/**
 * https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send
 *
 * A successful send is a 202 with an empty body, so the message id has to come
 * from the response header - there is nothing to parse.
 */
export const sendViaSendGrid: EmailAdapter<SendGridConfig> = (message, config) =>
  attemptSend(async () => {
    const content: { type: string; value: string }[] = []
    // SendGrid requires the plain-text part first when both are present.
    if (message.text) content.push({ type: 'text/plain', value: message.text })
    if (message.html) content.push({ type: 'text/html', value: message.html })

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
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
        content,
      }),
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    return { ok: true, id: response.headers.get('x-message-id') ?? undefined }
  })
