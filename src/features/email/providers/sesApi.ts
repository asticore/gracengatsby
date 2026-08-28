import type { EmailAdapter } from '../types'

import { attemptSend, describeHttpFailure, formatSender } from './http'

export type SesConfig = { accessKeyId: string; secretAccessKey: string; region: string }

const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const sha256Hex = async (value: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))

const hmac = async (key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value))
}

/**
 * SES is the one provider that will not take a static key in a header - every
 * request has to carry an AWS Signature Version 4, computed over the exact
 * method, path, headers and body being sent. It is done here by hand with Web
 * Crypto rather than with the AWS SDK because the SDK expects Node's crypto and
 * stream internals, which are not there on Workers.
 *
 * The signature is derived through four chained HMACs (date, region, service,
 * then the literal "aws4_request"); changing any part of the canonical request
 * below - header order, the signed-headers list, the body hash - invalidates it
 * and SES answers 403 with a message about the signature not matching.
 */
export const sendViaSesApi: EmailAdapter<SesConfig> = (message, config) =>
  attemptSend(async () => {
    const host = `email.${config.region}.amazonaws.com`
    const path = '/v2/email'
    const service = 'ses'

    const body = JSON.stringify({
      FromEmailAddress: formatSender(message.fromEmail, message.fromName),
      Destination: { ToAddresses: message.to },
      ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            ...(message.html ? { Html: { Data: message.html, Charset: 'UTF-8' } } : {}),
            ...(message.text ? { Text: { Data: message.text, Charset: 'UTF-8' } } : {}),
          },
        },
      },
    })

    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const bodyHash = await sha256Hex(body)

    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'content-type;host;x-amz-date'
    const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${bodyHash}`

    const scope = `${dateStamp}/${config.region}/${service}/aws4_request`
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`

    const dateKey = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), dateStamp)
    const regionKey = await hmac(dateKey, config.region)
    const serviceKey = await hmac(regionKey, service)
    const signingKey = await hmac(serviceKey, 'aws4_request')
    const signature = toHex(await hmac(signingKey, stringToSign))

    const response = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate,
        Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    })

    if (!response.ok) {
      return { ok: false, error: await describeHttpFailure(response), status: response.status }
    }

    const result = (await response.json().catch(() => ({}))) as { MessageId?: string }
    return { ok: true, id: result.MessageId }
  })
