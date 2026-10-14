/**
 * IndexNow key helpers. Kept free of imports on purpose: the SEO global config
 * (src/globals/SeoSettings.ts) imports the key hook below, so this module must
 * not pull the engine into that module graph.
 */

/**
 * The key file is served at this fixed path and sent to IndexNow as
 * `keyLocation`, so the key never has to be part of a route name.
 */
export const INDEXNOW_KEY_PATH = '/indexnow-key.txt'

const KEY_PATTERN = /^[a-f0-9]{32}$/

export const isValidIndexNowKey = (value: unknown): value is string =>
  typeof value === 'string' && KEY_PATTERN.test(value)

/** A new 32-character lowercase hex key from the platform's secure random source. */
export const newIndexNowKey = (): string => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type IndexNowGroup = { enabled?: boolean | null; key?: string | null }
type IndexNowKeyData = { indexNow?: IndexNowGroup | null }

/**
 * beforeChange on the seo-settings global. The key is never taken from the
 * request: an existing valid key is kept as it is, and a new one is created
 * only when IndexNow is switched on and no key exists yet.
 */
export const indexNowKeyBeforeChange = ({
  data,
  originalDoc,
}: {
  data?: IndexNowKeyData
  originalDoc?: IndexNowKeyData | null
}): IndexNowKeyData | undefined => {
  const group = data?.indexNow
  if (!data || !group || typeof group !== 'object') return data

  const existing = originalDoc?.indexNow?.key
  if (isValidIndexNowKey(existing)) {
    group.key = existing
  } else if (group.enabled) {
    group.key = newIndexNowKey()
  } else {
    group.key = null
  }
  return data
}
