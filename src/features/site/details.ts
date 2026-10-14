import { cache } from 'react'

import { getEngine } from '@/lib/engine'
import { normalizeSiteDetails, type SiteDetails } from './detailsModel'

/**
 * Site details for the current request (the `site-details` global). Wrapped in `cache`, so every place that needs
 * them in one render shares a single read. Never throws: an unreadable global gives the defaults.
 */
export const loadSiteDetails = cache(async (): Promise<SiteDetails> => {
  try {
    const engine = await getEngine()
    return normalizeSiteDetails(await engine.findGlobal({ slug: 'site-details', depth: 0 }))
  } catch {
    return normalizeSiteDetails(null)
  }
})
