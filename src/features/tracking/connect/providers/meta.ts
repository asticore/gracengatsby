import { MAX_AD_ACCOUNTS, MAX_PIXEL_OPTIONS, META_GRAPH_VERSION, META_SCOPES } from '../constants'
import { asRecord, requestJson, type Fetcher, type JsonOutcome } from '../http'
import { ProviderError, type PixelOption, type ProviderTokens, type TrackingProviderClient } from './types'

/**
 * Meta (Facebook Login). Each site owner uses their own Meta app, so the app ID
 * and secret come from the Tracking connections screen. Scopes are read-only:
 * the owner's ad accounts and the pixels on them. Meta has no refresh token; a
 * short-lived token is swapped for a long-lived one (about 60 days), and the
 * owner signs in again when it lapses.
 */

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

const DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`

const PIXEL_ID = /^\d{5,20}$/

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Graph returns errors as { error: { message } }. Only the refusal matters to the screen. */
function graphFailed(outcome: JsonOutcome): ProviderError {
  return new ProviderError(outcome.status >= 500 ? 'network' : 'refused')
}

async function graphGet(fetchImpl: Fetcher, path: string, params: Record<string, string>, accessToken?: string): Promise<JsonOutcome> {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const init: RequestInit = { method: 'GET', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
  try {
    return await requestJson(fetchImpl, url.toString(), init)
  } catch {
    throw new ProviderError('network')
  }
}

/** The data array of a Graph list answer. Anything else is treated as empty. */
export function graphData(body: Record<string, unknown>): Record<string, unknown>[] {
  const data = body.data
  return Array.isArray(data) ? data.map(asRecord).filter((row) => Object.keys(row).length > 0) : []
}

/** Pixels from one ad account's adspixels answer. Keeps only numeric IDs. */
export function mapAdsPixels(body: Record<string, unknown>, accountName: string): PixelOption[] {
  const items: PixelOption[] = []
  for (const row of graphData(body)) {
    const id = str(row.id)
    if (!PIXEL_ID.test(id)) continue
    const name = str(row.name) || 'Pixel'
    items.push({ value: id, label: `${name} (${id})${accountName ? ` - ${accountName}` : ''}` })
  }
  return items
}

/** Ad accounts from the me/adaccounts answer, as the { id, name } pairs the pixel lookup needs. */
export function mapAdAccounts(body: Record<string, unknown>): { id: string; name: string }[] {
  return graphData(body)
    .map((row) => ({ id: str(row.id), name: str(row.name) }))
    .filter((row) => /^act_\d{1,30}$/.test(row.id))
    .slice(0, MAX_AD_ACCOUNTS)
}

export const metaClient: TrackingProviderClient = {
  id: 'meta',
  // Meta's web login is documented with state and the app secret; PKCE is not claimed here.
  pkce: false,
  codeParam: 'code',

  authorizeUrl({ appId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: META_SCOPES.join(','),
    })
    return `${DIALOG}?${params.toString()}`
  },

  async exchangeCode({ appId, appSecret, code, redirectUri, fetchImpl }): Promise<ProviderTokens> {
    const short = await graphGet(fetchImpl, 'oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    })
    const shortToken = str(short.body.access_token)
    if (!short.ok || !shortToken) throw graphFailed(short)

    // Swap for a long-lived token. If Meta refuses the swap, the short one still works for now.
    const long = await graphGet(fetchImpl, 'oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    })
    const longToken = str(long.body.access_token)
    const useLong = long.ok && longToken.length > 0
    const accessToken = useLong ? longToken : shortToken
    const lifetime = Number(useLong ? long.body.expires_in : short.body.expires_in)

    const me = await graphGet(fetchImpl, 'me', { fields: 'id,name' }, accessToken)
    if (!me.ok) throw graphFailed(me)
    const name = str(me.body.name) || str(me.body.id) || 'a Facebook account'
    return {
      accessToken,
      expiresInSeconds: Number.isFinite(lifetime) && lifetime > 0 ? Math.floor(lifetime) : null,
      accountName: name,
    }
  },

  async listPixels({ accessToken, fetchImpl }): Promise<PixelOption[]> {
    const accounts = await graphGet(fetchImpl, 'me/adaccounts', { fields: 'id,name,account_id', limit: '100' }, accessToken)
    if (!accounts.ok) throw graphFailed(accounts)
    const items: PixelOption[] = []
    const seen = new Set<string>()
    for (const account of mapAdAccounts(accounts.body)) {
      const pixels = await graphGet(fetchImpl, `${account.id}/adspixels`, { fields: 'id,name', limit: '100' }, accessToken)
      if (!pixels.ok) continue
      for (const item of mapAdsPixels(pixels.body, account.name)) {
        if (seen.has(item.value)) continue
        seen.add(item.value)
        items.push(item)
        if (items.length >= MAX_PIXEL_OPTIONS) return items
      }
    }
    if (items.length === 0) throw new ProviderError('no-access')
    return items
  },

  async revoke({ accessToken, fetchImpl }): Promise<boolean> {
    try {
      const response = await requestJson(fetchImpl, `${GRAPH}/me/permissions`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      return response.ok
    } catch {
      return false
    }
  },
}
