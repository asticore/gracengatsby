/**
 * Server loader: read real settings and user manual state, compute progress.
 * Wraps errors gracefully so missing tables work.
 */

import type { Engine, TypedUser } from '@/engine'
import type { GetStartedData } from './compute'
import { computeProgress, type ComputedProgress } from './compute'
import { loadListPrefs } from '@/admin/list/listPrefs'

/**
 * Load settings data safely, returning empty object on any error.
 */
async function loadSettingsData(engine: Engine): Promise<GetStartedData> {
  try {
    const [siteSettings, seoSettings, emailSettings, paymentSettings] = await Promise.all([
      engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null),
      engine.findGlobal({ slug: 'seo-settings', depth: 0 }).catch((): null => null),
      engine.findGlobal({ slug: 'email-settings', depth: 0 }).catch((): null => null),
      engine.findGlobal({ slug: 'payment-settings', depth: 0 }).catch((): null => null),
    ])

    const data: GetStartedData = {}

    // From site-settings
    if (siteSettings) {
      const site = siteSettings as Record<string, unknown>
      data.siteName = typeof site.siteName === 'string' ? site.siteName : null
      data.logo = site.logo
      data.customDomain = typeof site.customDomain === 'string' ? site.customDomain : null
    }

    // From header/footer for social profiles
    try {
      const [header, footer] = await Promise.all([
        engine.findGlobal({ slug: 'header', depth: 0 }).catch((): null => null),
        engine.findGlobal({ slug: 'footer', depth: 0 }).catch((): null => null),
      ])

      const h = header as Record<string, unknown> | null
      const f = footer as Record<string, unknown> | null
      if (h && Array.isArray(h.socials)) data.headerSocials = h.socials as GetStartedData['headerSocials']
      if (f && Array.isArray(f.socials)) data.footerSocials = f.socials as GetStartedData['footerSocials']
    } catch {
      // Header/footer may not exist, safe to ignore
    }

    // From SEO settings: title template, description, og image
    if (seoSettings) {
      const seo = seoSettings as Record<string, unknown>
      const defaults = seo.defaults as Record<string, unknown> | undefined
      if (defaults) {
        data.seoTitleTemplate = typeof defaults.titleTemplate === 'string' ? defaults.titleTemplate : null
        data.seoDescription = typeof defaults.metaDescription === 'string' ? defaults.metaDescription : null
        data.seoOgImage = defaults.defaultOgImage
      }
      const analytics = seo.analytics as Record<string, unknown> | undefined
      if (analytics) {
        data.ga4MeasurementId = typeof analytics.ga4MeasurementId === 'string' ? analytics.ga4MeasurementId : null
        data.gtmContainerId = typeof analytics.gtmContainerId === 'string' ? analytics.gtmContainerId : null
        data.metaPixelId = typeof analytics.metaPixelId === 'string' ? analytics.metaPixelId : null
      }
    }

    // From email settings
    if (emailSettings) {
      const email = emailSettings as Record<string, unknown>
      data.emailProvider = typeof email.provider === 'string' ? email.provider : null
    }

    // From payment settings: stripe.enabled
    if (paymentSettings) {
      const payment = paymentSettings as Record<string, unknown>
      const stripe = payment.stripe as Record<string, unknown> | undefined
      if (stripe && stripe.enabled === true) {
        data.stripeEnabled = true
      }
    }

    // Count published pages
    try {
      const result = await engine.count({
        collection: 'pages',
        where: { _status: { equals: 'published' } },
      })
      if (typeof result === 'number') {
        data.pagesPublished = result
      }
    } catch {
      // Pages collection may not exist or query failed
    }

    return data
  } catch (error) {
    console.error('Error loading settings data for getting-started:', error)
    return {}
  }
}

/**
 * Load the user's manual done state from preferences.
 * Returns an array of item IDs they've manually marked complete.
 */
async function loadManualDoneState(
  engine: Engine,
  user: TypedUser | null,
): Promise<string[]> {
  if (!user) return []

  try {
    const prefs = await loadListPrefs(engine, user, 'getting-started')
    const ids = (prefs as Record<string, unknown>).doneIds
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  } catch (error) {
    console.error('Error loading getting-started manual state:', error)
    return []
  }
}

/**
 * Load and compute getting-started progress.
 * Safe to call with missing data; never throws.
 * Returns {progress, manualDoneIds} so the dashboard can pass manualDoneIds to client component.
 */
export async function loadGettingStartedProgress(
  engine: Engine,
  user: TypedUser | null,
): Promise<{ progress: ComputedProgress; manualDoneIds: string[] }> {
  const [settingsData, manualDoneIds] = await Promise.all([
    loadSettingsData(engine),
    loadManualDoneState(engine, user),
  ])

  const progress = computeProgress(settingsData, new Set(manualDoneIds))
  return { progress, manualDoneIds }
}
