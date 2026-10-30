import { MAX_AD_ACCOUNTS, MAX_PIXEL_OPTIONS, TIKTOK_API_BASE, TIKTOK_AUTH_URL } from '../constants'
import { asRecord, requestJson } from '../http'
import { ProviderError, type PixelOption, type ProviderTokens, type TrackingProviderClient } from './types'

/**
 * TikTok for Business. The owner's app ID and secret come from the Tracking
 * connections screen. The authorize step returns `auth_code` (not `code`). The
 * access token is long-lived and TikTok documents no refresh token here, so the
 * owner signs in again if TikTok stops accepting it. PKCE is not documented.
 */

const PIXEL_CODE = /^[A-Za-z0-9]{4,40}$/

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** TikTok answers with code 0 on success and puts the reason in message. Only the reason class is kept. */
function succeeded(body: Record<string, unknown>): boolean {
  return body.code === 0 || body.code === '0'
}

function apiData(body: Record<string, unknown>): Record<string, unknown> {
  return asRecord(body.data)
}

/** Pixel options from a pixel/list answer. Accepts both the `pixels` and the `list` shape TikTok has used. */
export function mapTikTokPixels(body: Record<string, unknown>, advertiserName: string): PixelOption[] {
  const data = apiData(body)
  const rows = Array.isArray(data.pixels) ? data.pixels : Array.isArray(data.list) ? data.list : []
  const items: PixelOption[] = []
  for (const raw of rows) {
    const row = asRecord(raw)
    const code = str(row.pixel_code) || str(row.pixel_id)
    if (!PIXEL_CODE.test(code)) continue
    const name = str(row.name) || 'Pixel'
    items.push({ value: code, label: `${name} (${code})${advertiserName ? ` - ${advertiserName}` : ''}` })
  }
  return items
}

/** Advertiser accounts from oauth2/advertiser/get. */
export function mapAdvertisers(body: Record<string, unknown>): { id: string; name: string }[] {
  const data = apiData(body)
  const rows = Array.isArray(data.list) ? data.list : []
  return rows
    .map((raw) => asRecord(raw))
    .map((row) => ({ id: str(row.advertiser_id), name: str(row.advertiser_name) }))
    .filter((row) => /^\d{1,30}$/.test(row.id))
    .slice(0, MAX_AD_ACCOUNTS)
}

export const tiktokClient: TrackingProviderClient = {
  id: 'tiktok',
  pkce: false,
  codeParam: 'auth_code',

  authorizeUrl({ appId, redirectUri, state }) {
    const params = new URLSearchParams({ app_id: appId, state, redirect_uri: redirectUri })
    return `${TIKTOK_AUTH_URL}?${params.toString()}`
  },

  async exchangeCode({ appId, appSecret, code, fetchImpl }): Promise<ProviderTokens> {
    let response
    try {
      response = await requestJson(fetchImpl, `${TIKTOK_API_BASE}/oauth2/access_token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ app_id: appId, secret: appSecret, auth_code: code }),
      })
    } catch {
      throw new ProviderError('network')
    }
    const data = apiData(response.body)
    const accessToken = str(data.access_token)
    if (!response.ok || !succeeded(response.body) || !accessToken) throw new ProviderError('refused')
    const advertisers = Array.isArray(data.advertiser_ids) ? data.advertiser_ids.length : 0
    return {
      accessToken,
      expiresInSeconds: null,
      accountName: advertisers > 0 ? `${advertisers} TikTok advertiser account${advertisers === 1 ? '' : 's'}` : 'a TikTok for Business account',
    }
  },

  async listPixels({ appId, accessToken, fetchImpl }): Promise<PixelOption[]> {
    const url = new URL(`${TIKTOK_API_BASE}/oauth2/advertiser/get/`)
    url.searchParams.set('app_id', appId)
    let advertisers
    try {
      advertisers = await requestJson(fetchImpl, url.toString(), { method: 'GET', headers: { 'Access-Token': accessToken } })
    } catch {
      throw new ProviderError('network')
    }
    if (!advertisers.ok || !succeeded(advertisers.body)) throw new ProviderError('refused')

    const items: PixelOption[] = []
    const seen = new Set<string>()
    for (const advertiser of mapAdvertisers(advertisers.body)) {
      const pixelUrl = new URL(`${TIKTOK_API_BASE}/pixel/list/`)
      pixelUrl.searchParams.set('advertiser_id', advertiser.id)
      let pixels
      try {
        pixels = await requestJson(fetchImpl, pixelUrl.toString(), { method: 'GET', headers: { 'Access-Token': accessToken } })
      } catch {
        continue
      }
      if (!pixels.ok || !succeeded(pixels.body)) continue
      for (const item of mapTikTokPixels(pixels.body, advertiser.name)) {
        if (seen.has(item.value)) continue
        seen.add(item.value)
        items.push(item)
        if (items.length >= MAX_PIXEL_OPTIONS) return items
      }
    }
    if (items.length === 0) throw new ProviderError('no-access')
    return items
  },

  // TikTok for Business documents no token revoke call used here. The token is deleted from this site; revoke in TikTok Business Center if needed.
  async revoke(): Promise<boolean> {
    return false
  },
}
