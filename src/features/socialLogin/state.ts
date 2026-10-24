import { b64urlDecode, b64urlEncode, randomToken, sameText } from './util'
import type { ProviderId } from './providers'

/**
 * The signed, short-lived state cookie that ties a provider's redirect back to
 * the browser that started it (CSRF), and carries the PKCE verifier and OIDC
 * nonce so neither ever appears in a URL.
 *
 * The cookie is HttpOnly and HMAC-signed with ENGAGE_SECRET. The `state`
 * parameter sent to the provider is a random value stored inside it; on return
 * the two must match, the signature must hold, the provider must be the one
 * that was started, and the cookie must be under ten minutes old.
 */

export const STATE_COOKIE = 'eg_social_state'
export const STATE_MAX_AGE_MS = 10 * 60 * 1000

export type FlowMode = 'signin' | 'link' | 'test'
export type FlowArea = 'account' | 'admin'

export type FlowState = {
  p: ProviderId
  /** The random `state` value sent to the provider. */
  s: string
  /** PKCE code verifier, '' when the provider is not sent one. */
  v: string
  /** OIDC nonce, '' for non-OIDC providers. */
  n: string
  mode: FlowMode
  area: FlowArea
  next: string
  /** The signed-in user who started a link or test; '' otherwise. */
  uid: string
  iat: number
}

const hmac = async (secret: string, payload: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))
}

export const newFlowSecrets = (): { s: string; v: string; n: string } => ({
  s: randomToken(24),
  v: randomToken(48),
  n: randomToken(24),
})

export async function sealState(secret: string, state: FlowState): Promise<string> {
  if (!secret) throw new Error('no-secret')
  const payload = b64urlEncode(JSON.stringify(state))
  return `${payload}.${await hmac(secret, payload)}`
}

/** Returns the state only when signature, freshness, provider and `state` parameter all agree. */
export async function openState(
  secret: string,
  cookie: string | null | undefined,
  stateParam: string | null | undefined,
  provider: ProviderId,
  now: number = Date.now(),
): Promise<FlowState | null> {
  if (!secret || !cookie || !stateParam) return null
  const parts = cookie.split('.')
  if (parts.length !== 2) return null
  if (!sameText(parts[1], await hmac(secret, parts[0]))) return null
  let state: FlowState
  try {
    state = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))) as FlowState
  } catch {
    return null
  }
  if (!state || state.p !== provider) return null
  if (typeof state.s !== 'string' || !sameText(state.s, stateParam)) return null
  const age = now - Number(state.iat)
  if (!Number.isFinite(age) || age < 0 || age > STATE_MAX_AGE_MS) return null
  return state
}
