/**
 * The pure half of the wave 16 communication connections migration: which
 * columns the communications group adds to eg_integrations, and which old
 * Email settings value is copied into each. No database here, so the copy rule
 * can be tested on its own. The migration in src/migrations applies it.
 *
 * Names are what src/cms/db/schema/generate.ts produces (snake case of the
 * flattened group path, e.g. communicationsSmsTwilioAuthToken).
 */

/** Every column the communications group adds to eg_integrations. All text, no default. */
export const COMMUNICATIONS_COLUMNS: readonly string[] = [
  'communications_default_provider',
  'communications_fallback_provider',
  'communications_resend_api_key',
  'communications_ses_api_access_key_id',
  'communications_ses_api_secret_access_key',
  'communications_ses_api_region',
  'communications_mailgun_api_key',
  'communications_mailgun_domain',
  'communications_mailgun_region',
  'communications_postmark_server_token',
  'communications_postmark_message_stream',
  'communications_sendgrid_api_key',
  'communications_cloudflare_api_token',
  'communications_cloudflare_account_id',
  'communications_brevo_api_key',
  'communications_mandrill_api_key',
  'communications_sms_provider',
  'communications_sms_twilio_account_sid',
  'communications_sms_twilio_auth_token',
  'communications_sms_twilio_from_number',
  'communications_sms_twilio_messaging_service_sid',
  'communications_sms_test_phone',
]

/**
 * Old column on eg_email_settings -> new column on eg_integrations. Brevo and
 * Mandrill and SMS are new, so they have no old source.
 */
export const COPY_PAIRS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'provider', to: 'communications_default_provider' },
  { from: 'resend_api_key', to: 'communications_resend_api_key' },
  { from: 'ses_api_access_key_id', to: 'communications_ses_api_access_key_id' },
  { from: 'ses_api_secret_access_key', to: 'communications_ses_api_secret_access_key' },
  { from: 'ses_api_region', to: 'communications_ses_api_region' },
  { from: 'mailgun_api_key', to: 'communications_mailgun_api_key' },
  { from: 'mailgun_domain', to: 'communications_mailgun_domain' },
  { from: 'mailgun_region', to: 'communications_mailgun_region' },
  { from: 'postmark_server_token', to: 'communications_postmark_server_token' },
  { from: 'postmark_message_stream', to: 'communications_postmark_message_stream' },
  { from: 'sendgrid_api_key', to: 'communications_sendgrid_api_key' },
  { from: 'cloudflare_api_token', to: 'communications_cloudflare_api_token' },
  { from: 'cloudflare_account_id', to: 'communications_cloudflare_account_id' },
]

/**
 * The value to write into a new column, or null when nothing should be written.
 *
 * Copy only when the new column is still blank and the old one has text in it.
 * A value already saved on the Integrations page is never overwritten by an old
 * one, and a blank old value never blanks a new one. Values are copied as they
 * are: secrets stay encrypted with the same key, so there is no re-encryption.
 */
export function decideCopy(target: unknown, source: unknown): string | null {
  const targetText = typeof target === 'string' ? target.trim() : ''
  if (targetText.length > 0) return null
  if (typeof source !== 'string') return null
  return source.trim().length > 0 ? source : null
}
