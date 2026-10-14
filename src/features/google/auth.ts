import type { Engine } from '@/engine'

import { GOOGLE_CONNECTION_SLUG, TOKEN_URL } from './constants'
import { requestJson } from './http'
import { toConnectionStatus, type GoogleConnectionStatus } from './status'

/**
 * Server-side Google sign-in: turns the saved refresh token into a short-lived
 * access token, cached in memory. Nothing here logs a token or a secret.
 */

export type GoogleEngine = Pick<Engine, 'findGlobal' | 'updateGlobal'>

export type GoogleTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not-connected' | 'refresh-failed'; message: string }

type Cached = { refreshToken: string; token: string; expiresAt: number }

/** A cached access token is dropped this long before Google says it expires. */
const REFRESH_MARGIN_MS = 60_000

const NOT_CONNECTED = 'Google is not connected yet. Connect it on the Google connection page.'

let cached: Cached | null = null
let errorRecorded = false

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The whole global document, secrets decrypted. Server use only. Null when it cannot be read. */
export async function readGoogleDoc(engine: GoogleEngine): Promise<Record<string, unknown> | null> {
  try {
    const doc = await engine.findGlobal({ slug: GOOGLE_CONNECTION_SLUG, depth: 0, overrideAccess: true })
    return (doc as Record<string, unknown> | null) ?? null
  } catch {
    return null
  }
}

/** The non-secret connection fields for the screen and the dashboards. */
export async function readGoogleConnection(engine: GoogleEngine): Promise<GoogleConnectionStatus> {
  return toConnectionStatus(await readGoogleDoc(engine))
}

/** The client ID and secret, for the token exchange only. Never send these to the browser. */
export async function readGoogleClient(engine: GoogleEngine): Promise<{ clientId: string; clientSecret: string }> {
  const doc = await readGoogleDoc(engine)
  return { clientId: text(doc?.clientId), clientSecret: text(doc?.clientSecretEnc) }
}

/** Plain-English reason for a refused refresh, from Google's error code. */
export function refreshFailureMessage(error: unknown): string {
  if (error === 'invalid_grant') return 'Google no longer accepts the saved sign-in. Click Connect with Google again.'
  if (error === 'invalid_client') return 'Google does not accept the client ID or secret. Check them on the Google connection page.'
  return 'Google would not refresh the sign-in. Try again in a few minutes, or connect again.'
}

/** Forgets the cached access token. Used after a disconnect or a new sign-in. */
export function clearGoogleTokenCache(): void {
  cached = null
}

async function recordError(engine: GoogleEngine, message: string | null): Promise<void> {
  try {
    await engine.updateGlobal({ slug: GOOGLE_CONNECTION_SLUG, data: { lastError: message ?? '' }, overrideAccess: true })
    errorRecorded = message !== null
  } catch {
    // The screen shows the error on the next visit anyway; a failed note must not fail the caller.
  }
}

/** A usable access token, refreshing it from the saved refresh token when needed. */
export async function getGoogleAccessToken(engine: GoogleEngine): Promise<GoogleTokenResult> {
  const doc = await readGoogleDoc(engine)
  const refreshToken = text(doc?.refreshTokenEnc)
  if (!refreshToken) return { ok: false, reason: 'not-connected', message: NOT_CONNECTED }

  if (cached && cached.refreshToken === refreshToken && cached.expiresAt > Date.now()) {
    return { ok: true, token: cached.token }
  }

  const clientId = text(doc?.clientId)
  const clientSecret = text(doc?.clientSecretEnc)
  if (!clientId || !clientSecret) {
    return { ok: false, reason: 'refresh-failed', message: 'The Google client ID or secret is missing. Add them on the Google connection page.' }
  }

  let result
  try {
    result = await requestJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })
  } catch {
    return { ok: false, reason: 'refresh-failed', message: 'Could not reach Google to refresh the sign-in. Try again in a minute.' }
  }

  const body = (result.body ?? {}) as { access_token?: unknown; expires_in?: unknown; error?: unknown }
  if (!result.ok || typeof body.access_token !== 'string' || !body.access_token) {
    const message = refreshFailureMessage(body.error)
    cached = null
    await recordError(engine, message)
    return { ok: false, reason: 'refresh-failed', message }
  }

  const lifetimeMs = Math.max(0, Number(body.expires_in ?? 3600) || 0) * 1000
  cached = { refreshToken, token: body.access_token, expiresAt: Date.now() + lifetimeMs - REFRESH_MARGIN_MS }
  if (errorRecorded) await recordError(engine, null)
  return { ok: true, token: body.access_token }
}
