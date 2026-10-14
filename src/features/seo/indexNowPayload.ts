import { isValidIndexNowKey } from './indexNowKey'

/**
 * Pure IndexNow request building and sending. No engine imports here, so the
 * specs can run it without a database.
 */

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow'
/** IndexNow accepts up to 10,000 URLs; this app sends at most 100 per call. */
export const INDEXNOW_MAX_URLS = 100

export type IndexNowSettings = { enabled: boolean; key: string | null }

export type IndexNowPayload = {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

/**
 * Builds the IndexNow body for one host. Keeps only https URLs on that host,
 * drops duplicates, and caps the list. Returns null when there is nothing
 * valid to send or the key is malformed.
 */
export const buildIndexNowPayload = (host: string, key: string, urls: readonly string[]): IndexNowPayload | null => {
  if (!host || !isValidIndexNowKey(key)) return null

  const seen = new Set<string>()
  const urlList: string[] = []
  for (const raw of urls) {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      continue
    }
    if (parsed.protocol !== 'https:' || parsed.host !== host) continue
    if (seen.has(parsed.href)) continue
    seen.add(parsed.href)
    urlList.push(parsed.href)
    if (urlList.length >= INDEXNOW_MAX_URLS) break
  }

  if (urlList.length === 0) return null
  return { host, key, keyLocation: `https://${host}/indexnow-key.txt`, urlList }
}

/**
 * Sends the URLs when IndexNow is on and a key exists. Returns true only when
 * the search engine answered with a success status. Never throws, and sends
 * nothing when disabled.
 */
export const sendIndexNow = async (
  settings: IndexNowSettings,
  baseUrl: string,
  urls: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<boolean> => {
  try {
    if (!settings.enabled || !isValidIndexNowKey(settings.key)) return false

    let host: string
    try {
      host = new URL(baseUrl).host
    } catch {
      return false
    }

    const payload = buildIndexNowPayload(host, settings.key, urls)
    if (!payload) return false

    const response = await fetchFn(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch {
    return false
  }
}
