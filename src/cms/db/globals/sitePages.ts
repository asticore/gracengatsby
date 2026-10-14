import { SitePages } from '@/globals/SitePages'

import { createGlobalOps } from '../generic'
import { sitePages } from '../schema'

/**
 * The `site-pages` global (src/globals/SitePages.ts): special pages, plus the maintenance group.
 * Table eg_site_pages. Relationship fields are plain integer ids here.
 */
export type SitePagesDoc = {
  id: number
  notFoundPage?: number | null
  privacyPolicyPage?: number | null
  termsPage?: number | null
  maintenance?: {
    enabled?: boolean | null
    headline?: string | null
    message?: string | null
    bypassToken?: string | null
    allowAdmins?: boolean | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(sitePages, SitePages, {}, {})

export const findSitePages = ops.find as unknown as () => Promise<SitePagesDoc | null>
export const updateSitePages = ops.update as unknown as (
  data: Partial<Omit<SitePagesDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SitePagesDoc>
