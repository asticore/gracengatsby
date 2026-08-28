/**
 * The shared vocabulary for sending mail.
 *
 * Callers (forms, members, backups) only ever see `SendEmailArgs` and
 * `SendEmailResult`; everything below that line is adapter plumbing. Keeping
 * the caller-facing shape here rather than in index.ts means an adapter can
 * import the types it needs without pulling the whole feature in behind it.
 */

export type EmailProviderKey = 'resend' | 'ses-api' | 'mailgun' | 'postmark' | 'sendgrid' | 'cloudflare'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  /** Overrides the reply-to address configured in settings, when set. */
  replyTo?: string
}

/**
 * Why a send did not happen. Callers branch on this rather than string-matching
 * the message - `disabled` and `not-configured` are normal states an operator
 * can fix, `provider-rejected` is the provider's own complaint and worth
 * surfacing verbatim.
 */
export type SendEmailFailure =
  | 'disabled'
  | 'not-configured'
  | 'invalid-message'
  | 'unsupported-provider'
  | 'provider-rejected'

/**
 * Flat rather than a discriminated union on purpose: this project compiles with
 * `strictNullChecks` off, where narrowing a `{ ok: true } | { ok: false }` union
 * does not work and every caller would have to cast to read `error`. One shape
 * with optional members keeps `if (result.ok)` honest at the call site.
 */
export type SendEmailResult = {
  ok: boolean
  provider?: EmailProviderKey
  /** The provider's own id for the accepted message, when it gives one. */
  id?: string
  reason?: SendEmailFailure
  /** Safe to show an admin: either our own explanation or the provider's. */
  error?: string
  /** HTTP status from the provider, when the failure came from one. */
  status?: number
}

/** A message after defaults from settings have been folded in. */
export type OutgoingEmail = {
  to: string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  fromEmail: string
  fromName?: string
}

export type ProviderResponse = { ok: boolean; id?: string; error?: string; status?: number }

export type EmailAdapter<Config> = (message: OutgoingEmail, config: Config) => Promise<ProviderResponse>

/**
 * The stored settings, described locally rather than imported from the
 * generated types. The generated file is rewritten whenever anyone regenerates
 * types; this feature should not break in the gap between a field changing and
 * that regeneration happening.
 */
export type EmailSettingsDoc = {
  provider?: string | null
  fromName?: string | null
  fromEmail?: string | null
  replyToEmail?: string | null
  resend?: { apiKey?: string | null } | null
  sesApi?: {
    accessKeyId?: string | null
    secretAccessKey?: string | null
    region?: string | null
  } | null
  mailgun?: {
    apiKey?: string | null
    domain?: string | null
    region?: string | null
  } | null
  postmark?: { serverToken?: string | null; messageStream?: string | null } | null
  sendgrid?: { apiKey?: string | null } | null
  cloudflare?: { apiToken?: string | null; accountId?: string | null } | null
  testing?: { testRecipient?: string | null } | null
}
