import { INTEGRATIONS_SLUG } from '@/features/google/constants'

import { clientFor, ProviderError, type PixelOption, type TrackingProviderClient } from './providers'
import { connectRedirectUri, stateCookieName, type ConnectProvider } from './constants'
import { CONNECT_STATE_MAX_AGE_MS, openConnectFlow, pkceChallengeFor, randomUrlToken, sealConnectFlow, type ConnectFlow } from './oauthCookie'
import type { Fetcher } from './http'
import { clearSignIn, readAccessToken, readAppCredentials, readConnectionDoc, writeAppCredentials, writeError, writeSignIn, type ConnectEngine } from './store'

/**
 * The Meta and TikTok connection steps: start a sign-in, finish it from the
 * callback, list the pixels, save one as the pixel ID, and disconnect. Every
 * step takes its dependencies (engine, fetch, secret, clock) so the tests run
 * without the network or the database.
 */

export type ServiceDeps = {
  engine: ConnectEngine
  fetchImpl: Fetcher
  /** ENGAGE_SECRET. Empty means the sign-in cannot be sealed, so every start refuses. */
  secret: string
  now: () => number
}

/** A short reason the screen turns into a translated sentence. Never provider text. */
export type ConnectReason = 'no-secret' | 'no-app' | 'state' | 'no-code' | 'denied' | 'refused' | 'network' | 'no-access' | 'bad-value' | 'not-listed' | 'not-connected' | 'expired' | 'bad-app' | 'error'

export type StartResult = { ok: true; location: string; cookie: { name: string; value: string; maxAge: number } } | { ok: false; reason: ConnectReason }

export async function startConnect(deps: ServiceDeps, provider: ConnectProvider, origin: string): Promise<StartResult> {
  if (!deps.secret) return { ok: false, reason: 'no-secret' }
  const creds = await readAppCredentials(deps.engine, provider)
  if (!creds) return { ok: false, reason: 'no-app' }
  const client = clientFor(provider)
  const state = randomUrlToken(24)
  const verifier = client.pkce ? randomUrlToken(48) : ''
  const flow: ConnectFlow = { p: provider, s: state, v: verifier, r: 'tracking', iat: deps.now() }
  const location = client.authorizeUrl({
    appId: creds.appId,
    redirectUri: connectRedirectUri(origin, provider),
    state,
    codeChallenge: client.pkce ? pkceChallengeFor(verifier) : undefined,
  })
  return {
    ok: true,
    location,
    cookie: { name: stateCookieName(provider), value: sealConnectFlow(deps.secret, flow), maxAge: Math.floor(CONNECT_STATE_MAX_AGE_MS / 1000) },
  }
}

export type FinishResult = { ok: true } | { ok: false; reason: ConnectReason }

/** The callback. Verifies the signed state, exchanges the code, and stores the token and the account name. */
export async function finishConnect(
  deps: ServiceDeps,
  provider: ConnectProvider,
  origin: string,
  input: { code: string; stateParam: string | null; cookie: string | null },
): Promise<FinishResult> {
  const flow = openConnectFlow(deps.secret, input.cookie, input.stateParam, provider, deps.now())
  if (!flow) return { ok: false, reason: 'state' }
  if (!input.code || input.code.length > 2000) return { ok: false, reason: 'no-code' }
  const creds = await readAppCredentials(deps.engine, provider)
  if (!creds) return { ok: false, reason: 'no-app' }
  const client = clientFor(provider)
  try {
    const tokens = await client.exchangeCode({
      appId: creds.appId,
      appSecret: creds.appSecret,
      code: input.code,
      redirectUri: connectRedirectUri(origin, provider),
      codeVerifier: flow.v || undefined,
      fetchImpl: deps.fetchImpl,
    })
    const now = new Date(deps.now())
    const expiresAt = tokens.expiresInSeconds ? new Date(deps.now() + tokens.expiresInSeconds * 1000).toISOString() : null
    await writeSignIn(deps.engine, provider, { accessToken: tokens.accessToken, accountName: tokens.accountName, expiresAt, now })
    return { ok: true }
  } catch (error) {
    const reason = reasonOf(error)
    await writeError(deps.engine, provider, reason)
    return { ok: false, reason: reason as ConnectReason }
  }
}

function reasonOf(error: unknown): string {
  if (error instanceof ProviderError) return error.reason
  return 'error'
}

export type PixelListResult = { ok: true; items: PixelOption[] } | { ok: false; reason: ConnectReason }

/** The pixels for the picker. Uses the saved sign-in; a failure is recorded so the screen can explain it. */
export async function listPixelChoices(deps: ServiceDeps, provider: ConnectProvider): Promise<PixelListResult> {
  const creds = await readAppCredentials(deps.engine, provider)
  if (!creds) return { ok: false, reason: 'no-app' }
  const accessToken = await readAccessToken(deps.engine, provider)
  if (!accessToken) return { ok: false, reason: 'not-connected' }
  // Meta's long-lived token lapses after about 60 days. Say so, rather than letting Meta refuse the call.
  const expiresAt = Date.parse(String((await readConnectionDoc(deps.engine))?.[`${provider}TokenExpiresAt`] ?? ''))
  if (Number.isFinite(expiresAt) && expiresAt <= deps.now()) return { ok: false, reason: 'expired' }
  try {
    const items = await clientFor(provider).listPixels({ appId: creds.appId, accessToken, fetchImpl: deps.fetchImpl })
    await writeError(deps.engine, provider, '')
    return { ok: true, items }
  } catch (error) {
    const reason = reasonOf(error)
    await writeError(deps.engine, provider, reason)
    return { ok: false, reason: reason as ConnectReason }
  }
}

/** Format of a pixel ID for each platform. Checked before anything is saved. */
export const PIXEL_VALUE = {
  meta: /^\d{5,20}$/,
  tiktok: /^[A-Za-z0-9]{4,40}$/,
} as const

/** The Integrations group and field each platform's pixel ID lives in. */
const PIXEL_GROUP: Record<ConnectProvider, 'metaPixel' | 'tiktokPixel'> = { meta: 'metaPixel', tiktok: 'tiktokPixel' }

export type PickResult =
  | { ok: true; pixelId: string; previous: string; replaced: boolean }
  | { ok: false; reason: ConnectReason }

/**
 * Saves a chosen pixel as the Integrations pixel ID. The value must be on a fresh
 * list from the provider, so a hand-made request cannot store an arbitrary ID.
 * An explicit choice replaces the old ID; the Integrations field keeps its other settings.
 */
export async function pickPixel(deps: ServiceDeps, provider: ConnectProvider, value: string): Promise<PickResult> {
  if (!PIXEL_VALUE[provider].test(value)) return { ok: false, reason: 'bad-value' }
  const listed = await listPixelChoices(deps, provider)
  if ('reason' in listed) return listed
  if (!listed.items.some((item) => item.value === value)) return { ok: false, reason: 'not-listed' }
  const group = PIXEL_GROUP[provider]
  const integrations = ((await deps.engine.findGlobal({ slug: INTEGRATIONS_SLUG, depth: 0, overrideAccess: true }).catch((): null => null)) ?? {}) as Record<string, unknown>
  const current = (integrations[group] && typeof integrations[group] === 'object' ? integrations[group] : {}) as Record<string, unknown>
  const previous = typeof current.pixelId === 'string' ? current.pixelId.trim() : ''
  await deps.engine.updateGlobal({
    slug: INTEGRATIONS_SLUG,
    data: { [group]: { ...current, pixelId: value } },
    overrideAccess: true,
  })
  return { ok: true, pixelId: value, previous, replaced: previous !== '' && previous !== value }
}

export type SaveAppResult = { ok: true; signedOut: boolean } | { ok: false; reason: ConnectReason }

/** Saves the app ID and secret. The secret is optional on later saves: blank keeps the saved one. */
export async function saveAppCredentials(
  deps: ServiceDeps,
  provider: ConnectProvider,
  input: { appId: string; appSecret: string | null },
): Promise<SaveAppResult> {
  if (!/^\d{5,30}$/.test(input.appId)) return { ok: false, reason: 'bad-app' }
  if (input.appSecret !== null && !/^[!-~]{8,200}$/.test(input.appSecret)) return { ok: false, reason: 'bad-app' }
  const { signedOut } = await writeAppCredentials(deps.engine, provider, input)
  return { ok: true, signedOut }
}

/**
 * Disconnect: asks the provider to revoke the token where it can, then deletes
 * it here either way. The pixel ID already set on Integrations is left in place,
 * so the tag keeps working until the owner clears it there.
 */
export async function disconnect(deps: ServiceDeps, provider: ConnectProvider): Promise<{ ok: true; revokedAtProvider: boolean }> {
  const creds = await readAppCredentials(deps.engine, provider)
  const accessToken = await readAccessToken(deps.engine, provider)
  let revokedAtProvider = false
  if (creds && accessToken) {
    const client: TrackingProviderClient = clientFor(provider)
    revokedAtProvider = await client.revoke({ appId: creds.appId, appSecret: creds.appSecret, accessToken, fetchImpl: deps.fetchImpl }).catch((): boolean => false)
  }
  await clearSignIn(deps.engine, provider)
  return { ok: true, revokedAtProvider }
}
