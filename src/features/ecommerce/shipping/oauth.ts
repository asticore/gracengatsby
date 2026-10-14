import { basicAuth, fetchJson } from './http'

type Token = { token: string; expiresAt: number }
const tokens = new Map<string, Token>()

export type OAuthArgs = {
  carrier: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  /** FedEx takes client_id and client_secret in the form body; UPS uses a Basic header. */
  credentialsInBody?: boolean
}

/**
 * Client-credentials sign-in shared by UPS and FedEx. Tokens are kept in memory until shortly before
 * they expire, so a checkout does not sign in again for every rate request. Never logs the secret.
 */
export async function oauthToken(args: OAuthArgs): Promise<string> {
  if (!args.clientId.trim() || !args.clientSecret.trim()) throw new Error(`Enter the ${args.carrier} client ID and client secret first.`)
  const key = `${args.tokenUrl}|${args.clientId}|${args.clientSecret}`
  const hit = tokens.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.token
  const form = new URLSearchParams({ grant_type: 'client_credentials' })
  if (args.credentialsInBody) {
    form.set('client_id', args.clientId)
    form.set('client_secret', args.clientSecret)
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  if (!args.credentialsInBody) headers.Authorization = basicAuth(args.clientId, args.clientSecret)
  const res = await fetchJson<{ access_token?: string; expires_in?: number | string }>(args.tokenUrl, { method: 'POST', headers, body: form.toString() })
  if (res.status === 401 || res.status === 403) throw new Error(`${args.carrier} did not accept that client ID and secret. Check them in Shop settings > Shipping.`)
  const token = res.body?.access_token
  if (!res.ok || !token) throw new Error(`${args.carrier} did not give a sign-in token (${res.status}). Try again shortly.`)
  const secs = Number(res.body?.expires_in)
  const ttlMs = (Number.isFinite(secs) && secs > 120 ? secs - 60 : 300) * 1000
  tokens.set(key, { token, expiresAt: Date.now() + ttlMs })
  return token
}

/** Forgets every cached token (tests use this). */
export function clearOauthCache(): void {
  tokens.clear()
}
