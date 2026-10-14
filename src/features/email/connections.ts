import type { EmailProviderKey, EmailSettingsDoc, SmsSettingsDoc } from './types'

/**
 * Where the provider keys live (wave 16). Every key moved from the Email
 * settings global to the `communications` group of the Integrations global, so
 * they sit with the other third-party credentials. This file is the pure half:
 * the list of providers and the merge that lets the send path read the new
 * location, falling back to the old fields only where the new one is blank.
 * The database read lives in connectionLoad.ts.
 */

export const EMAIL_PROVIDERS: { key: EmailProviderKey; label: string }[] = [
  { key: 'resend', label: 'Resend' },
  { key: 'ses-api', label: 'Amazon SES (API)' },
  { key: 'mailgun', label: 'Mailgun' },
  { key: 'postmark', label: 'Postmark' },
  { key: 'sendgrid', label: 'SendGrid' },
  { key: 'cloudflare', label: 'Cloudflare Email' },
  { key: 'brevo', label: 'Brevo' },
  { key: 'mandrill', label: 'Mandrill (Mailchimp Transactional)' },
]

/** The shape of the `communications` group as the engine returns it (nested, decrypted). */
export type CommunicationsDoc = {
  defaultProvider?: string | null
  fallbackProvider?: string | null
  resend?: { apiKey?: string | null } | null
  sesApi?: { accessKeyId?: string | null; secretAccessKey?: string | null; region?: string | null } | null
  mailgun?: { apiKey?: string | null; domain?: string | null; region?: string | null } | null
  postmark?: { serverToken?: string | null; messageStream?: string | null } | null
  sendgrid?: { apiKey?: string | null } | null
  cloudflare?: { apiToken?: string | null; accountId?: string | null } | null
  brevo?: { apiKey?: string | null } | null
  mandrill?: { apiKey?: string | null } | null
  sms?: SmsSettingsDoc | null
} | null

/** Trimmed text, or '' for anything that is not a non-empty string. */
export const filled = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The first of two values that has text in it, or null when neither does. */
export const firstFilled = (primary: unknown, legacy: unknown): string | null => filled(primary) || filled(legacy) || null

/**
 * Builds the settings the send path reads, from the new location with the old
 * Email settings fields behind it. Only a blank new value falls back, so once an
 * operator saves a key on the Integrations page the old one is ignored.
 *
 * `fromName`, `fromEmail`, `replyToEmail` and `testing` always come from the
 * Email settings global - they are sender details, not connections.
 */
export function mergeConnections(
  communications: CommunicationsDoc,
  legacy: EmailSettingsDoc | null | undefined,
): EmailSettingsDoc {
  const c: NonNullable<CommunicationsDoc> = communications ?? {}
  const l: EmailSettingsDoc = legacy ?? {}
  const fallback = filled(c.fallbackProvider)

  return {
    ...l,
    provider: firstFilled(c.defaultProvider, l.provider),
    fallbackProvider: fallback === 'none' ? null : fallback || null,
    resend: { apiKey: firstFilled(c.resend?.apiKey, l.resend?.apiKey) },
    brevo: { apiKey: firstFilled(c.brevo?.apiKey, null) },
    mandrill: { apiKey: firstFilled(c.mandrill?.apiKey, null) },
    sesApi: {
      accessKeyId: firstFilled(c.sesApi?.accessKeyId, l.sesApi?.accessKeyId),
      secretAccessKey: firstFilled(c.sesApi?.secretAccessKey, l.sesApi?.secretAccessKey),
      region: firstFilled(c.sesApi?.region, l.sesApi?.region),
    },
    mailgun: {
      apiKey: firstFilled(c.mailgun?.apiKey, l.mailgun?.apiKey),
      domain: firstFilled(c.mailgun?.domain, l.mailgun?.domain),
      region: firstFilled(c.mailgun?.region, l.mailgun?.region),
    },
    postmark: {
      serverToken: firstFilled(c.postmark?.serverToken, l.postmark?.serverToken),
      messageStream: firstFilled(c.postmark?.messageStream, l.postmark?.messageStream),
    },
    sendgrid: { apiKey: firstFilled(c.sendgrid?.apiKey, l.sendgrid?.apiKey) },
    cloudflare: {
      apiToken: firstFilled(c.cloudflare?.apiToken, l.cloudflare?.apiToken),
      accountId: firstFilled(c.cloudflare?.accountId, l.cloudflare?.accountId),
    },
    sms: c.sms ?? null,
  }
}
