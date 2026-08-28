import { cache } from 'react'

import type { Media, SeoSetting, SiteSetting } from '@/engage-types'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'

/**
 * The per-document SEO group added by src/fields/seo.ts. Typed structurally
 * rather than off one collection so pages, posts and products can all be
 * passed in without a union at every call site.
 */
export type DocumentSeo = {
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: (number | string | Media) | null
  noIndex?: boolean | null
} | null

/**
 * Everything the SEO output needs, read once per request.
 *
 * `enabled` is false whenever the SEO feature toggle is off, and every public
 * entry point returns nothing in that case - the toggle has to mean "produces
 * no output", not "produces output nobody asked for".
 */
export type SeoContext = {
  enabled: boolean
  settings: SeoSetting | null
  siteName: string
  baseUrl: string
}

/**
 * Absolute URLs cannot be derived from the request inside generateMetadata or
 * a static route, so the canonical origin is configuration. Set SITE_URL as a
 * Worker variable per environment.
 */
export const getBaseUrl = (): string =>
  (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/+$/, '')

/**
 * Reads the SEO global plus the bits of Site Settings it leans on.
 *
 * Wrapped in `cache` so metadata, the JSON-LD block and the script tags -
 * which all run separately within one render - share a single pair of reads
 * instead of hitting the database three times over.
 *
 * Deliberately never throws: a settings read that fails mid-request should
 * degrade to "no SEO output", not blank the page it was decorating.
 */
export const getSeoContext = cache(async (): Promise<SeoContext> => {
  const baseUrl = getBaseUrl()

  try {
    const flags = await getFeatureFlags()
    if (!flags.seo) {
      return { enabled: false, settings: null, siteName: '', baseUrl }
    }

    const engine = await getEngine()
    const [settings, site] = await Promise.all([
      engine.findGlobal({ slug: 'seo-settings', depth: 1 }).catch((): null => null) as Promise<SeoSetting | null>,
      engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null) as Promise<SiteSetting | null>,
    ])

    return {
      enabled: true,
      settings,
      siteName: site?.siteName || '',
      baseUrl,
    }
  } catch {
    return { enabled: false, settings: null, siteName: '', baseUrl }
  }
})

/** Upload fields arrive as an id when depth is 0 and an object when populated. */
export const mediaUrl = (value: (number | string | Media) | null | undefined): string | undefined => {
  if (value && typeof value === 'object') return (value as Media).url || undefined
  return undefined
}

export const mediaDimensions = (
  value: (number | string | Media) | null | undefined,
): { width?: number; height?: number } => {
  if (value && typeof value === 'object') {
    const media = value as Media
    return { width: media.width ?? undefined, height: media.height ?? undefined }
  }
  return {}
}

/** Turns a relative path or an already-absolute URL into an absolute URL. */
export const absoluteUrl = (value: string | undefined, baseUrl: string): string | undefined => {
  if (!value) return undefined
  if (/^https?:\/\//i.test(value)) return value
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`
}

/** Normalises a site path to a single leading slash and no trailing slash. */
export const normalisePath = (path: string | undefined | null): string => {
  if (!path) return '/'
  const trimmed = `/${String(path).trim().replace(/^\/+/, '').replace(/\/+$/, '')}`
  return trimmed === '/' ? '/' : trimmed
}

/** One path per line, blanks and `#` comments dropped. */
export const parsePathList = (value: string | null | undefined): string[] =>
  (value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => normalisePath(line))

/**
 * A listed path matches itself, anything beneath it, and honours a trailing
 * `*` - so `/private/*` and `/private` both cover `/private/thing`. Editors
 * write these by hand, so both spellings have to work.
 */
export const pathMatches = (path: string, patterns: string[]): boolean => {
  const target = normalisePath(path)
  return patterns.some((pattern) => {
    const clean = pattern.replace(/\/?\*+$/, '') || '/'
    if (clean === '/') return pattern.includes('*') ? true : target === '/'
    return target === clean || target.startsWith(`${clean}/`)
  })
}
