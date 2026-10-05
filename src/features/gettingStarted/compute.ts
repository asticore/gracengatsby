/**
 * Compute getting-started progress from settings and manual state.
 * Pure function with no side effects. Missing data never throws.
 */

import { GETTING_STARTED_ITEMS } from './items'

export type GetStartedData = {
  siteName?: string | null
  logo?: unknown // shape varies, just check truthiness
  headerSocials?: Array<{ url?: string }> | null
  footerSocials?: Array<{ url?: string }> | null
  seoTitleTemplate?: string | null
  seoDescription?: string | null
  seoOgImage?: unknown
  ga4MeasurementId?: string | null
  gtmContainerId?: string | null
  metaPixelId?: string | null
  emailProvider?: string | null
  stripeEnabled?: boolean
  twoFactorEnabled?: boolean
  backupsEnabled?: boolean
  customDomain?: string | null
  pagesPublished?: number
}

export type ComputedProgress = {
  percent: number // 0-100
  done: number
  total: number
  byCategory: Record<
    string,
    {
      done: number
      total: number
    }
  >
}

/**
 * Detect which items are auto-marked as done based on real data.
 * Safely handles missing or null fields.
 */
function detectDoneIds(data: GetStartedData): Set<string> {
  const done = new Set<string>()

  // Site basics: site-name-logo needs BOTH siteName and logo to auto-tick
  if (data.siteName && data.logo) done.add('site-name-logo')
  // Header/footer: only mark done if they have socials
  if (data.headerSocials && data.headerSocials.length > 0) done.add('header')
  if (data.footerSocials && data.footerSocials.length > 0) done.add('footer')
  if ((data.headerSocials && data.headerSocials.length > 0) || (data.footerSocials && data.footerSocials.length > 0)) {
    done.add('social-links')
  }

  // Content
  if (data.pagesPublished && data.pagesPublished > 0) done.add('first-page')
  // SEO basics: based on site meta fields (titleTemplate, description, ogImage)
  if (data.seoTitleTemplate || data.seoDescription || data.seoOgImage) done.add('seo-basics')

  // Connect services: GA4, GTM, or Meta pixel
  if (data.ga4MeasurementId || data.gtmContainerId || data.metaPixelId) {
    done.add('connect-google')
  }

  // Communication
  if (data.emailProvider) done.add('email-provider')

  // Shop: stripe enabled
  if (data.stripeEnabled) done.add('payments')

  // Security
  if (data.twoFactorEnabled) done.add('security')
  if (data.backupsEnabled) done.add('backups-enabled')

  // Go live
  if (data.customDomain) done.add('custom-domain')

  return done
}

/**
 * Compute overall and per-category progress.
 * @param data Settings data for auto-detection
 * @param manualDoneIds Set of manually-marked item IDs
 */
export function computeProgress(
  data: GetStartedData,
  manualDoneIds: Set<string> = new Set(),
): ComputedProgress {
  const autoDetected = detectDoneIds(data)
  const allDone = new Set([...autoDetected, ...manualDoneIds])

  const byCategory: Record<string, { done: number; total: number }> = {}
  let totalDone = 0
  let totalItems = 0

  for (const item of GETTING_STARTED_ITEMS) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = { done: 0, total: 0 }
    }
    byCategory[item.category].total += 1
    totalItems += 1

    if (allDone.has(item.id)) {
      byCategory[item.category].done += 1
      totalDone += 1
    }
  }

  const percent = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0

  return {
    percent,
    done: totalDone,
    total: totalItems,
    byCategory,
  }
}
