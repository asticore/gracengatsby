import { cache } from 'react'
import { cookies, headers } from 'next/headers'

import { CONSENT_COOKIE_NAME, effectiveChoices, parseRecord } from '@/features/consent/consent'
import { normaliseConsentConfig } from '@/features/consent/config'
import { requireOptIn } from '@/features/consent/regions'
import { getEngine } from '@/lib/engine'

import { buildPublicConfig, type PublicConfig } from './builders'
import {
  DEFAULT_ADS_SETTINGS,
  normaliseAdsSettings,
  normalisePlacement,
  normaliseUnit,
  type AdPlacement,
  type AdUnit,
  type AdsSettings,
} from './config'
import { AD_PLACEMENTS_SLUG, AD_SETTINGS_SLUG, AD_UNITS_SLUG } from './slugs'

/**
 * Everything a server component needs to place ads, read once per request.
 * A fresh install (no rows, feature off) costs one small settings read and
 * returns a disabled context, so nothing downstream renders.
 */
export type AdsContext = {
  settings: AdsSettings
  units: Map<string, AdUnit>
  placements: AdPlacement[]
  config: PublicConfig | null
  /** The visitor is in a region that must opt in (drives GDPR handling). */
  optIn: boolean
  /** Marketing consent already stored, or granted by default for this visitor. */
  marketingGranted: boolean
  policyVersion: number
}

export const DISABLED_CONTEXT: AdsContext = {
  settings: DEFAULT_ADS_SETTINGS,
  units: new Map(),
  placements: [],
  config: null,
  optIn: true,
  marketingGranted: false,
  policyVersion: 1,
}

type Loose = Record<string, unknown> | null

const decodeCookie = (raw: string | undefined): string | null => {
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/** Per request. Never throws: any failure means "no ads on this page". */
export const getAdsContext = cache(async (): Promise<AdsContext> => {
  try {
    const engine = await getEngine()
    const site = (await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): null => null)) as Loose
    const flag = (site?.features as { ads?: unknown } | undefined)?.ads === true
    if (!flag) return DISABLED_CONTEXT

    const [rawSettings, unitDocs, placementDocs, integrations] = await Promise.all([
      engine.findGlobal({ slug: AD_SETTINGS_SLUG, depth: 0, overrideAccess: true }).catch((): null => null),
      engine.find({ collection: AD_UNITS_SLUG, limit: 200, depth: 0, overrideAccess: true, pagination: false }).catch(() => ({ docs: [] as unknown[] })),
      engine.find({ collection: AD_PLACEMENTS_SLUG, limit: 200, depth: 0, overrideAccess: true, pagination: false }).catch(() => ({ docs: [] as unknown[] })),
      engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true }).catch((): null => null),
    ])

    const settings = normaliseAdsSettings(rawSettings, true)
    const unitList = (unitDocs.docs as unknown[]).map(normaliseUnit).filter((u): u is AdUnit => u !== null)
    const idToKey = new Map<number, string>()
    for (const doc of unitDocs.docs as Array<{ id?: unknown; key?: unknown }>) {
      if (typeof doc.id === 'number' && typeof doc.key === 'string') idToKey.set(doc.id, doc.key)
    }
    const placements = (placementDocs.docs as unknown[]).map((d) => normalisePlacement(d, idToKey)).filter((p): p is AdPlacement => p !== null)

    const consent = normaliseConsentConfig(integrations, null)
    const country = (await headers()).get('cf-ipcountry')
    const optIn = consent.enabled && requireOptIn(country, consent.mode)
    const stored = parseRecord(decodeCookie((await cookies()).get(CONSENT_COOKIE_NAME)?.value))
    const marketingGranted = effectiveChoices(stored, consent.policyVersion, !optIn).marketing

    return {
      settings,
      units: new Map(unitList.map((u) => [u.key, u])),
      placements,
      config: buildPublicConfig(settings, unitList),
      optIn,
      marketingGranted,
      policyVersion: consent.policyVersion,
    }
  } catch {
    return DISABLED_CONTEXT
  }
})

export type AdsPageState = {
  /** Set by the page (or post, or product) when its "No ads" switch is on. */
  noAds: boolean
  /** Which collection the page belongs to, for per-type placements. */
  collection: 'pages' | 'posts' | 'products' | null
  /** Ads already placed on this page by automatic placements. */
  inserted: number
}

/**
 * Per request page state. Written by AdsPageScope at the top of a page, read
 * by every slot below it. Server components render parent first, so the page
 * has already declared itself by the time its content asks.
 */
export const getAdsPageState = cache((): AdsPageState => ({ noAds: false, collection: null, inserted: 0 }))

/** The most ads automatic placements may add to one page. */
export const MAX_AUTO_ADS_PER_PAGE = 5
