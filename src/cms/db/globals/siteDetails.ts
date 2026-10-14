import { SiteDetails } from '@/globals/SiteDetails'

import { createGlobalOps } from '../generic'
import { siteDetails, siteDetailsGroupFields } from '../schema'

/**
 * The `site-details` global (src/globals/SiteDetails.ts): one row. Scalars plus one `business` group, which
 * the groupFields option rebuilds into nested form. A missing row or value means the defaults in
 * src/features/site/detailsModel.ts.
 */
export type SiteDetailsDoc = {
  id: number
  timezone?: string | null
  dateFormat?: string | null
  timeFormat?: string | null
  business?: {
    businessName?: string | null
    legalName?: string | null
    abn?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
    streetAddress?: string | null
    suburb?: string | null
    state?: string | null
    postcode?: string | null
    country?: string | null
    openingHours?: string | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(siteDetails, SiteDetails, {}, { groupFields: siteDetailsGroupFields })

export const findSiteDetails = ops.find as unknown as () => Promise<SiteDetailsDoc | null>
export const updateSiteDetails = ops.update as unknown as (
  data: Partial<Omit<SiteDetailsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SiteDetailsDoc>
