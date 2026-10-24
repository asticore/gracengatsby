import { appleClientSecret, TokenError, verifyIdToken, type Claims, type Fetcher } from './jwt'
import { PROVIDERS, type ProviderConfig, type ProviderId } from './providers'
import { b64urlEncode, sha256 } from './util'

/**
 * OAuth 2.0 authorization code flow for the six providers: the authorize URL,
 * the code exchange, and turning the answer into one normalised identity.
 */

export type Identity = {
  provider: ProviderId
  providerUserId: string
  email: string | null
  /** True only when the provider itself says the address is verified. */
  emailVerified: boolean
}

export class FlowError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

/**
 * Facebook returns an email but never says whether it is confirmed, so it is
 * not trusted for new accounts or linking by email. Flip only with evidence.
 */
export const FACEBOOK_EMAIL_TRUSTED = false

const HTTP_TIMEOUT_MS = 10_000

async function timed(fetchImpl: Fetcher, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export const pkceChallenge = async (verifier: string): Promise<string> => b64urlEncode(await sha256(verifier))

export async function buildAuthorizeUrl(
  id: ProviderId,
  cfg: ProviderConfig,
  args: { redirectUri: string; state: string; nonce: string; verifier: string },
): Promise<string> {
  const def = PROVIDERS[id]
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope: def.scopes.join(' '),
    state: args.state,
    ...def.authParams,
  })
  if (def.oidc) params.set('nonce', args.nonce)
  if (def.pkce && args.verifier) {
    params.set('code_challenge', await pkceChallenge(args.verifier))
    params.set('code_challenge_method', 'S256')
  }
  return `${def.authUrl(cfg)}?${params.toString()}`
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/** Providers send "true"/true (Apple sends a string). Anything else is not verified. */
const isTrue = (value: unknown): boolean => value === true || value === 'true'

export async function exchangeForIdentity(
  id: ProviderId,
  cfg: ProviderConfig,
  args: { code: string; redirectUri: string; verifier: string; nonce: string; fetchImpl: Fetcher; now?: number },
): Promise<Identity> {
  const def = PROVIDERS[id]
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: cfg.clientId,
  })
  if (def.pkce && args.verifier) body.set('code_verifier', args.verifier)
  if (id === 'apple') {
    try {
      body.set(
        'client_secret',
        await appleClientSecret({ teamId: cfg.teamId, keyId: cfg.keyId, clientId: cfg.clientId, privateKey: cfg.privateKey }, args.now),
      )
    } catch {
      throw new FlowError('bad-credentials')
    }
  } else {
    body.set('client_secret', cfg.clientSecret)
  }

  let tokenBody: Record<string, unknown>
  try {
    const response = await timed(args.fetchImpl, def.tokenUrl(cfg), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    })
    tokenBody = asRecord(await response.json().catch((): null => null))
    if (!response.ok || tokenBody.error) throw new FlowError('exchange')
  } catch (error) {
    if (error instanceof FlowError) throw error
    throw new FlowError('network')
  }

  if (def.oidc) {
    const idToken = tokenBody.id_token
    if (typeof idToken !== 'string') throw new FlowError('no-id-token')
    let claims: Claims
    try {
      claims = await verifyIdToken(idToken, {
        jwksUrl: def.oidc.jwksUrl,
        audience: cfg.clientId,
        nonce: args.nonce,
        issuerOk: (iss, c) => def.oidc!.issuerOk(iss, c, cfg),
        fetchImpl: args.fetchImpl,
        now: args.now,
      })
    } catch (error) {
      throw new FlowError(error instanceof TokenError ? `token-${error.reason}` : 'token')
    }
    return identityFromClaims(id, claims)
  }

  const accessToken = tokenBody.access_token
  if (typeof accessToken !== 'string' || !accessToken) throw new FlowError('no-access-token')
  try {
    if (id === 'github') return await githubIdentity(accessToken, args.fetchImpl)
    if (id === 'discord') return await discordIdentity(accessToken, args.fetchImpl)
    return await facebookIdentity(accessToken, args.fetchImpl)
  } catch (error) {
    if (error instanceof FlowError) throw error
    throw new FlowError('network')
  }
}

const normEmail = (value: unknown): string | null =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null

/** Maps verified id_token claims to an identity. Exported for the tests. */
export function identityFromClaims(id: ProviderId, claims: Claims): Identity {
  const email = normEmail(claims.email)
  let verified = isTrue(claims.email_verified)
  if (id === 'microsoft') {
    // Microsoft id tokens do not carry email_verified. `xms_edov` says the domain owner verified it; the personal-account tenant verifies addresses itself.
    verified = isTrue(claims.xms_edov) || claims.xms_edov === 1 || claims.tid === '9188040d-6c67-4c5b-b112-36a304b66dad' || verified
  }
  return { provider: id, providerUserId: String(claims.sub), email, emailVerified: Boolean(email) && verified }
}

async function githubIdentity(token: string, fetchImpl: Fetcher): Promise<Identity> {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'engage-social-login' }
  const userRes = await timed(fetchImpl, 'https://api.github.com/user', { headers })
  const user = asRecord(await userRes.json().catch((): null => null))
  if (!userRes.ok || user.id === undefined || user.id === null) throw new FlowError('no-profile')

  let email: string | null = null
  let verified = false
  const emailsRes = await timed(fetchImpl, 'https://api.github.com/user/emails', { headers })
  if (emailsRes.ok) {
    const list = (await emailsRes.json().catch((): null => null)) as unknown
    const rows = Array.isArray(list) ? list.map(asRecord) : []
    // Only the primary address that GitHub marks verified is trusted.
    const primary = rows.find((r) => r.primary === true && r.verified === true)
    if (primary) {
      email = normEmail(primary.email)
      verified = Boolean(email)
    }
  }
  return { provider: 'github', providerUserId: String(user.id), email, emailVerified: verified }
}

async function discordIdentity(token: string, fetchImpl: Fetcher): Promise<Identity> {
  const res = await timed(fetchImpl, 'https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } })
  const user = asRecord(await res.json().catch((): null => null))
  if (!res.ok || typeof user.id !== 'string') throw new FlowError('no-profile')
  const email = normEmail(user.email)
  return { provider: 'discord', providerUserId: user.id, email, emailVerified: Boolean(email) && user.verified === true }
}

async function facebookIdentity(token: string, fetchImpl: Fetcher): Promise<Identity> {
  const res = await timed(fetchImpl, 'https://graph.facebook.com/v19.0/me?fields=id,email', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const user = asRecord(await res.json().catch((): null => null))
  if (!res.ok || typeof user.id !== 'string') throw new FlowError('no-profile')
  const email = normEmail(user.email)
  return { provider: 'facebook', providerUserId: user.id, email, emailVerified: FACEBOOK_EMAIL_TRUSTED && Boolean(email) }
}
