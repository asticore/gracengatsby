import { getCloudflareContext } from '@opennextjs/cloudflare'

import { buildAdsTxtLines, adsCspAdditions, type CspAdditions } from './builders'
import { DEFAULT_ADS_SETTINGS, nestSettingsRow, normaliseAdsSettings, type AdsSettings } from './config'
import { AD_SETTINGS_TABLE, AD_UNITS_TABLE } from './slugs'

/**
 * Lightweight settings reader for places without the engine (middleware, the
 * ads.txt route): one single-row read held in isolate memory for a minute.
 * Fails to "off", so a database problem never adds hosts to the CSP.
 */
const TTL_MS = 60_000
let cached: { at: number; value: AdsSettings } | null = null

export async function readAdsSettingsFromD1(): Promise<AdsSettings> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.value
  let value = DEFAULT_ADS_SETTINGS
  try {
    const { env } = await getCloudflareContext({ async: true })
    const db = (env as { D1?: D1Database }).D1
    if (db) {
      const flag = (await db.prepare('SELECT features_ads FROM `eg_site_settings` LIMIT 1').all()).results?.[0] as { features_ads?: unknown } | undefined
      if (flag?.features_ads === 1 || flag?.features_ads === true) {
        const row = (await db.prepare(`SELECT * FROM \`${AD_SETTINGS_TABLE}\` LIMIT 1`).all()).results?.[0] as Record<string, unknown> | undefined
        value = normaliseAdsSettings(nestSettingsRow(row), true)
      }
    }
  } catch {
    value = DEFAULT_ADS_SETTINGS
  }
  cached = { at: now, value }
  return value
}

let cachedKeys: { at: number; value: ReadonlySet<string> } | null = null

/**
 * Keys of the enabled ad units while Ads is switched on, held in isolate memory for a minute. Used by the
 * public beacon so a hit costs no database read in the common case. Fails to "no units".
 */
export async function readAdUnitKeysFromD1(): Promise<ReadonlySet<string>> {
  const now = Date.now()
  if (cachedKeys && now - cachedKeys.at < TTL_MS) return cachedKeys.value
  let value: ReadonlySet<string> = new Set()
  try {
    const { env } = await getCloudflareContext({ async: true })
    const db = (env as { D1?: D1Database }).D1
    if (db) {
      const flag = (await db.prepare('SELECT features_ads FROM `eg_site_settings` LIMIT 1').all()).results?.[0] as { features_ads?: unknown } | undefined
      if (flag?.features_ads === 1 || flag?.features_ads === true) {
        const rows = (await db.prepare(`SELECT \`key\` FROM \`${AD_UNITS_TABLE}\` WHERE enabled IS NOT 0 LIMIT 200`).all()).results as { key?: unknown }[] | undefined
        value = new Set((rows ?? []).map((r) => r.key).filter((k): k is string => typeof k === 'string'))
      }
    }
  } catch {
    value = new Set()
  }
  cachedKeys = { at: now, value }
  return value
}

export const invalidateAdsSettingsCache = (): void => {
  cached = null
  cachedKeys = null
}

export const readGeneratedAdsTxtLines = async (): Promise<string[]> => buildAdsTxtLines(await readAdsSettingsFromD1())
export const readAdsCspAdditions = async (): Promise<CspAdditions> => adsCspAdditions(await readAdsSettingsFromD1())
