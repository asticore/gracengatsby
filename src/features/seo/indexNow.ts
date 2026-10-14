import { getEngine } from '@/lib/engine'

import { isValidIndexNowKey } from './indexNowKey'
import { sendIndexNow, type IndexNowSettings } from './indexNowPayload'
import { getSeoContext } from './settings'

/** Reads the IndexNow group of the seo-settings global. */
export const readIndexNowSettings = async (): Promise<IndexNowSettings> => {
  const engine = await getEngine()
  const doc = (await engine.findGlobal({ slug: 'seo-settings', depth: 0 })) as {
    indexNow?: { enabled?: boolean | null; key?: string | null } | null
  } | null
  return { enabled: Boolean(doc?.indexNow?.enabled), key: doc?.indexNow?.key ?? null }
}

/**
 * Submits URLs to IndexNow. Does nothing when the SEO feature is off or
 * IndexNow is disabled. Never throws.
 */
export const submitIndexNow = async (urls: readonly string[]): Promise<boolean> => {
  try {
    const context = await getSeoContext()
    if (!context.enabled) return false
    return await sendIndexNow(await readIndexNowSettings(), context.baseUrl, urls)
  } catch {
    return false
  }
}

/** The body of the key file, or null when it must not be served. */
export const renderIndexNowKey = async (): Promise<string | null> => {
  try {
    const context = await getSeoContext()
    if (!context.enabled) return null
    const settings = await readIndexNowSettings()
    return settings.enabled && isValidIndexNowKey(settings.key) ? settings.key : null
  } catch {
    return null
  }
}