import type { SpeedSetting } from '@/engage-types'

/**
 * The Speed global as stored, with every branch optional.
 *
 * Callers pass whatever came back from the settings read - possibly `null`
 * after a failed lookup - and `resolveSpeed()` turns it into a fully-populated
 * shape so no consumer has to repeat the same optional-chaining dance.
 */
export type SpeedSettingsInput = Partial<SpeedSetting> | null | undefined

export type ResolvedSpeed = {
  /**
   * False when the Speed feature is switched off in Site Settings. Every
   * consumer short-circuits on this, so a disabled feature is a true no-op
   * rather than "all the toggles happen to be off".
   */
  enabled: boolean
  caching: {
    pageCache: boolean
    ttlSeconds: number
    cacheLoggedInUsers: boolean
    purgeOnPublish: boolean
  }
  assets: {
    deferThirdPartyJs: boolean
  }
  media: {
    lazyLoadImages: boolean
    lazyLoadIframes: boolean
    addImageDimensions: boolean
  }
  advanced: {
    preconnectOrigins: string[]
    prefetchDns: string[]
    delayJsExecution: boolean
  }
}

export const DISABLED_SPEED: ResolvedSpeed = {
  enabled: false,
  caching: { pageCache: false, ttlSeconds: 0, cacheLoggedInUsers: false, purgeOnPublish: false },
  assets: { deferThirdPartyJs: false },
  media: { lazyLoadImages: false, lazyLoadIframes: false, addImageDimensions: false },
  advanced: { preconnectOrigins: [], prefetchDns: [], delayJsExecution: false },
}

/** Anything below this is almost certainly a typo and would defeat caching entirely. */
const MIN_TTL_SECONDS = 30
/** A week. Longer than this and a stale page outlives anyone's patience for a purge to fix it. */
const MAX_TTL_SECONDS = 604800

const clampTtl = (value: number | null | undefined): number => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 3600
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.round(raw)))
}

/**
 * Only origins/domains that parse are kept. A malformed entry here would end up
 * as a `<link>` the browser silently ignores, so dropping it early keeps the
 * emitted head honest about what it is actually doing.
 */
const cleanOrigins = (rows: { url?: string | null }[] | null | undefined): string[] => {
  const out: string[] = []
  for (const row of rows || []) {
    const raw = (row?.url || '').trim()
    if (!raw) continue
    try {
      out.push(new URL(raw.includes('//') ? raw : `https://${raw}`).origin)
    } catch {
      continue
    }
  }
  return Array.from(new Set(out))
}

const cleanDomains = (rows: { domain?: string | null }[] | null | undefined): string[] => {
  const out: string[] = []
  for (const row of rows || []) {
    const raw = (row?.domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    if (!raw || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) continue
    out.push(`//${raw}`)
  }
  return Array.from(new Set(out))
}

export const resolveSpeed = (settings: SpeedSettingsInput, featureEnabled: boolean): ResolvedSpeed => {
  if (!featureEnabled || !settings) return DISABLED_SPEED

  return {
    enabled: true,
    caching: {
      pageCache: Boolean(settings.caching?.pageCache),
      ttlSeconds: clampTtl(settings.caching?.cacheTtlSeconds),
      cacheLoggedInUsers: Boolean(settings.caching?.cacheLoggedInUsers),
      // Defaults on: clearing saved copies after an edit has no downside.
      purgeOnPublish: settings.caching?.purgeOnPublish !== false,
    },
    assets: {
      deferThirdPartyJs: Boolean(settings.assets?.deferJs),
    },
    media: {
      lazyLoadImages: settings.media?.lazyLoadImages !== false,
      lazyLoadIframes: settings.media?.lazyLoadIframes !== false,
      addImageDimensions: settings.media?.addImageDimensions !== false,
    },
    advanced: {
      preconnectOrigins: cleanOrigins(settings.advanced?.preconnectOrigins),
      prefetchDns: cleanDomains(settings.advanced?.prefetchDns),
      delayJsExecution: Boolean(settings.advanced?.delayJsExecution),
    },
  }
}
