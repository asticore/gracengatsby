import type { ResolvedFormSettings } from './types'

/**
 * The three spam filters, in the order they cost anything.
 *
 * Honeypot and fill time are local, free and invisible; Turnstile is a network
 * call to Cloudflare and is only made when the first two have already passed,
 * so an obvious bot never costs an outbound request.
 *
 * Every check returns a reason rather than throwing. The caller reports one
 * generic failure to the visitor regardless of which check tripped - telling a
 * bot which filter caught it is telling it what to change.
 */

/**
 * The honeypot's field name.
 *
 * Deliberately plausible rather than obviously fake: bots fill fields whose
 * names look real, and skip anything called `honeypot`. Kept as one constant
 * because the renderer draws it and the handler reads it, and a mismatch would
 * silently disable the filter.
 */
export const HONEYPOT_FIELD = 'eg_company_website'

/** Hidden field carrying when the form was rendered, for the fill-time check. */
export const RENDERED_AT_FIELD = 'eg_rendered_at'

export const TURNSTILE_FIELD = 'cf-turnstile-response'

export type SpamVerdict = {
  spam: boolean
  reason?: 'honeypot' | 'too-fast' | 'turnstile' | 'turnstile-unavailable'
  detail?: string
}

const PASS: SpamVerdict = { spam: false }

/** Anything at all in the hidden field means a machine filled it in. */
export function checkHoneypot(value: unknown, enabled: boolean): SpamVerdict {
  if (!enabled) return PASS
  const filled = typeof value === 'string' ? value.trim() !== '' : Boolean(value)
  return filled ? { spam: true, reason: 'honeypot' } : PASS
}

/**
 * Rejects a submission that arrived faster than a person could type.
 *
 * The rendered-at stamp comes from the browser and so can be forged - a bot
 * that bothers can send a timestamp from a minute ago. It is still worth having
 * because almost none of them do, and the cost is a hidden input. A missing or
 * unreadable stamp is treated as a pass, not a failure: an old cached page or a
 * visitor with scripting quirks must not be locked out of a contact form.
 */
export function checkFillTime(
  renderedAt: unknown,
  minimumSeconds: number,
  now = Date.now(),
): SpamVerdict {
  if (!minimumSeconds || minimumSeconds <= 0) return PASS

  const stamp = typeof renderedAt === 'number' ? renderedAt : Number.parseInt(String(renderedAt ?? ''), 10)
  if (!Number.isFinite(stamp) || stamp <= 0) return PASS

  // A stamp in the future is a clock-skew artefact, not evidence of anything.
  const elapsedSeconds = (now - stamp) / 1000
  if (elapsedSeconds < 0) return PASS

  return elapsedSeconds < minimumSeconds
    ? { spam: true, reason: 'too-fast', detail: `Submitted after ${elapsedSeconds.toFixed(1)}s.` }
    : PASS
}

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifies a Turnstile token with Cloudflare.
 *
 * Fails *open* when the secret key is missing or Cloudflare is unreachable: an
 * operator who switched Turnstile on without finishing the keys, or a
 * Cloudflare outage, would otherwise silently swallow every enquiry the site
 * receives. The verdict says which happened so the failure is visible in the
 * log rather than only in the missing enquiries.
 */
export async function checkTurnstile(
  token: unknown,
  settings: ResolvedFormSettings,
  remoteIp?: string,
): Promise<SpamVerdict> {
  if (!settings.turnstile) return PASS
  if (!settings.turnstileSecretKey) {
    return { spam: false, reason: 'turnstile-unavailable', detail: 'No Turnstile secret key is set.' }
  }

  const response = typeof token === 'string' ? token.trim() : ''
  if (!response) return { spam: true, reason: 'turnstile', detail: 'No challenge response was sent.' }

  const body = new URLSearchParams({ secret: settings.turnstileSecretKey, response })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const result = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const json = (await result.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (json?.success) return PASS

    return {
      spam: true,
      reason: 'turnstile',
      detail: (json?.['error-codes'] || []).join(', ') || 'Cloudflare rejected the challenge.',
    }
  } catch (error) {
    return {
      spam: false,
      reason: 'turnstile-unavailable',
      detail: error instanceof Error ? error.message : 'Turnstile could not be reached.',
    }
  }
}
