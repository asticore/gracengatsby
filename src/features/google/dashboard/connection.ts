import { readGoogleConnection, type GoogleEngine } from '../auth'

/**
 * Whether Google is connected, plus the non-secret ids the widgets need. Reads the connection global
 * through the engine (G1's readGoogleConnection). Never returns tokens or the client secret.
 */

export type GoogleConnectionInfo = Awaited<ReturnType<typeof readGoogleConnection>>

export type ConnectionCheck = { connected: true; info: GoogleConnectionInfo } | { connected: false }

export type EngineArg = GoogleEngine

export async function checkConnection(engine: EngineArg): Promise<ConnectionCheck> {
  const info = await readGoogleConnection(engine)
  if (!info || !info.connected) return { connected: false }
  return { connected: true, info }
}

/** Strips a leading "properties/" so both "123" and "properties/123" work. Null when it is not a numeric id. */
export function ga4PropertyNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().replace(/^properties\//, '')
  return /^\d{3,15}$/.test(value) ? value : null
}

/** Search Console site: a domain property ("sc-domain:example.com") or a URL-prefix property ("https://example.com/"). */
export function searchSiteOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value.length === 0 || value.length > 300) return null
  if (value.startsWith('sc-domain:') && /^sc-domain:[a-z0-9.-]+$/i.test(value)) return value
  if (/^https:\/\/[^\s]+$/.test(value)) return value
  return null
}

/** AdSense account: "accounts/pub-123" or "pub-123" both become "accounts/pub-123". */
export function adsenseAccountOrNull(...raw: unknown[]): string | null {
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const value = item.trim()
    if (/^accounts\/pub-\d+$/.test(value)) return value
    if (/^pub-\d+$/.test(value)) return `accounts/${value}`
  }
  return null
}
