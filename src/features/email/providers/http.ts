import type { ProviderResponse } from '../types'

/**
 * Turns a failed provider response into a message worth showing an operator.
 *
 * Providers disagree about where they put the reason - Resend nests it under
 * `message`, SendGrid returns an `errors` array, Mailgun uses `message`,
 * Postmark uses `Message`, AWS uses `message`/`Message` - so rather than a
 * per-provider parser we look in every place any of them use and fall back to
 * the raw body. The raw body is what actually diagnoses the odd cases (an HTML
 * error page from a proxy, an empty 500), so it must never be swallowed.
 */
export const describeHttpFailure = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => '')

  if (body) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>
      const errors = parsed.errors
      if (Array.isArray(errors) && errors.length > 0) {
        const messages = errors
          .map((entry) =>
            typeof entry === 'string' ? entry : ((entry as Record<string, unknown>)?.message as string | undefined),
          )
          .filter(Boolean)
        if (messages.length > 0) return messages.join('; ')
      }
      const single = parsed.message ?? parsed.Message ?? parsed.error ?? parsed.detail
      if (typeof single === 'string' && single.length > 0) return single
    } catch {
      // Not JSON - the raw text below is the best description we have.
    }
  }

  const trimmed = body.trim().slice(0, 500)
  return trimmed.length > 0 ? trimmed : `${response.status} ${response.statusText}`.trim()
}

/**
 * Wraps a provider call so no adapter can throw into its caller. A DNS failure,
 * a TLS error or an aborted request all become the same structured refusal a
 * rejected send does, because to everything upstream they mean the same thing:
 * the mail did not go out, and here is why.
 */
export const attemptSend = async (send: () => Promise<ProviderResponse>): Promise<ProviderResponse> => {
  try {
    return await send()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Could not reach the email provider: ${message}` }
  }
}

/** Both the human name and the address, in the form every provider accepts. */
export const formatSender = (email: string, name?: string): string =>
  name && name.trim().length > 0 ? `${name} <${email}>` : email
