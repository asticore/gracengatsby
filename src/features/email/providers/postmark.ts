import type { EmailAdapter } from '../types'

import { attemptSend, describeHttpFailure, formatSender } from './http'

export type PostmarkConfig = { serverToken: string; messageStream?: string | null }

/**
 * https://postmarkapp.com/developer/api/email-api
 *
 * Postmark answers 200 for some rejections and puts the real verdict in
 * `ErrorCode`, so a non-zero code is treated as a failure even on a 200.
 */
export const sendViaPostmark: EmailAdapter<PostmarkConfig> = (message, config) =>
  attemptSend(async () => {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': config.serverToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        From: formatSender(message.fromEmail, message.fromName),
        To: message.to.join(','),
        Subject: message.subject,
        ...(message.html ? { HtmlBody: message.html } : {}),
        ...(message.text ? { TextBody: message.text } : {}),
        ...(message.replyTo ? { ReplyTo: message.replyTo } : {}),
        MessageStream: config.messageStream || 'outbound',
      }),
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    const result = (await response.json().catch(() => ({}))) as {
      MessageID?: string
      ErrorCode?: number
      Message?: string
    }

    if (result.ErrorCode && result.ErrorCode !== 0) {
      return { ok: false, error: result.Message || `Postmark error ${result.ErrorCode}`, status: response.status }
    }

    return { ok: true, id: result.MessageID }
  })
