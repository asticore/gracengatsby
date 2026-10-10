/**
 * The anonymised consent log entry.
 *
 * What is kept: a random id for the decision, the policy version, the three
 * optional categories, the decision time (the audit row's created_at) and,
 * only when geo logging is on, the two-letter country.
 *
 * What is never kept: an IP address, a user agent, a cookie value, or anything
 * that identifies the visitor. The audit writer is called without an IP or
 * agent, and the rate limiter's counter stays in memory and is not written.
 */

export type ConsentLogBody = {
  id: string
  v: number
  c: { preferences: boolean; analytics: boolean; marketing: boolean }
}

/** A real body is well under 300 bytes. Anything bigger is not from this page. */
export const MAX_CONSENT_LOG_BYTES = 2048

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function parseConsentLogBody(input: unknown): ConsentLogBody | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const body = input as Record<string, unknown>

  if (typeof body.id !== 'string' || !ID_PATTERN.test(body.id)) return null
  if (typeof body.v !== 'number' || !Number.isInteger(body.v) || body.v < 0 || body.v > 1_000_000) return null

  if (!body.c || typeof body.c !== 'object' || Array.isArray(body.c)) return null
  const choices = body.c as Record<string, unknown>
  const keys = ['preferences', 'analytics', 'marketing'] as const
  if (keys.some((key) => typeof choices[key] !== 'boolean')) return null

  return {
    id: body.id,
    v: body.v,
    c: {
      preferences: choices.preferences === true,
      analytics: choices.analytics === true,
      marketing: choices.marketing === true,
    },
  }
}

/** The text stored in the audit row's detail column. Stable key order, so rows can be compared. */
export function consentLogDetail(body: ConsentLogBody, region: string | null): string {
  return JSON.stringify({
    id: body.id,
    v: body.v,
    c: body.c,
    ...(region ? { region } : {}),
  })
}
