import type { EmailProviderKey, EmailSettingsDoc, OutgoingEmail, ProviderResponse } from '../types'

import { sendViaCloudflare } from './cloudflare'
import { sendViaMailgun } from './mailgun'
import { sendViaPostmark } from './postmark'
import { sendViaResend } from './resend'
import { sendViaSendGrid } from './sendgrid'
import { sendViaSesApi } from './sesApi'

/** `send` is null exactly when `missing` lists what settings are still blank. */
export type ResolvedProvider = {
  send: ((message: OutgoingEmail) => Promise<ProviderResponse>) | null
  missing: string[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Picks the adapter for the configured provider and checks it has everything it
 * needs before anything is sent.
 *
 * The check happens here, once, rather than inside each adapter: a missing key
 * should read as "you have not finished setting this up" with the field named,
 * not as whatever 401 the provider happens to return for an empty credential.
 */
export const resolveProvider = (provider: EmailProviderKey, settings: EmailSettingsDoc): ResolvedProvider => {
  switch (provider) {
    case 'resend': {
      const apiKey = text(settings.resend?.apiKey)
      if (!apiKey) return { send: null, missing: ['Resend API key'] }
      return { send: (message) => sendViaResend(message, { apiKey }), missing: [] }
    }

    case 'ses-api': {
      const accessKeyId = text(settings.sesApi?.accessKeyId)
      const secretAccessKey = text(settings.sesApi?.secretAccessKey)
      const region = text(settings.sesApi?.region)
      const missing = [
        ...(accessKeyId ? [] : ['access key ID']),
        ...(secretAccessKey ? [] : ['secret access key']),
        ...(region ? [] : ['region']),
      ]
      if (missing.length > 0) return { send: null, missing: missing.map((item) => `Amazon SES ${item}`) }
      return { send: (message) => sendViaSesApi(message, { accessKeyId, secretAccessKey, region }), missing: [] }
    }

    case 'mailgun': {
      const apiKey = text(settings.mailgun?.apiKey)
      const domain = text(settings.mailgun?.domain)
      const missing = [...(apiKey ? [] : ['API key']), ...(domain ? [] : ['sending domain'])]
      if (missing.length > 0) return { send: null, missing: missing.map((item) => `Mailgun ${item}`) }
      return {
        send: (message) => sendViaMailgun(message, { apiKey, domain, region: text(settings.mailgun?.region) || 'us' }),
        missing: [],
      }
    }

    case 'postmark': {
      const serverToken = text(settings.postmark?.serverToken)
      if (!serverToken) return { send: null, missing: ['Postmark server token'] }
      return {
        send: (message) =>
          sendViaPostmark(message, { serverToken, messageStream: text(settings.postmark?.messageStream) || 'outbound' }),
        missing: [],
      }
    }

    case 'sendgrid': {
      const apiKey = text(settings.sendgrid?.apiKey)
      if (!apiKey) return { send: null, missing: ['SendGrid API key'] }
      return { send: (message) => sendViaSendGrid(message, { apiKey }), missing: [] }
    }

    case 'cloudflare': {
      const apiToken = text(settings.cloudflare?.apiToken)
      const accountId = text(settings.cloudflare?.accountId)
      const missing = [...(apiToken ? [] : ['API token']), ...(accountId ? [] : ['account ID'])]
      if (missing.length > 0) return { send: null, missing: missing.map((item) => `Cloudflare ${item}`) }
      return { send: (message) => sendViaCloudflare(message, { apiToken, accountId }), missing: [] }
    }
  }
}

/** Every provider that can actually deliver from this host. */
export const SUPPORTED_PROVIDERS: EmailProviderKey[] = [
  'resend',
  'ses-api',
  'mailgun',
  'postmark',
  'sendgrid',
  'cloudflare',
]

export const isSupportedProvider = (value: unknown): value is EmailProviderKey =>
  typeof value === 'string' && (SUPPORTED_PROVIDERS as string[]).includes(value)
