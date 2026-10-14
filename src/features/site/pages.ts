import { cache } from 'react'
import { headers } from 'next/headers'

import type { Page } from '@/engage-types'
import { getEngine } from '@/lib/engine'
import { getAllResolvedPages } from '@/utilities/pagePaths'

import { normaliseSitePages, pathForPage, type SitePagesConfig } from './pagesShape'

/**
 * Reads the site-pages global once per request. Never throws: a failed read gives the defaults, so a
 * database hiccup cannot take the site into maintenance or break the 404 page.
 */
export const getSitePages = cache(async (): Promise<SitePagesConfig> => {
  const engine = await getEngine()
  const raw = await engine.findGlobal({ slug: 'site-pages', depth: 0, overrideAccess: true }).catch((): null => null)
  return normaliseSitePages(raw)
})

/** A page to show as a special page, only when it is published and not in the trash. */
export const loadPublishedPage = async (id: number | null): Promise<Page | null> => {
  if (!id) return null
  const engine = await getEngine()
  const doc = (await engine.findByID({ collection: 'pages', id, depth: 0, overrideAccess: true }).catch((): null => null)) as unknown as
    | (Page & { trashedAt?: string | null; _status?: string | null })
    | null
  if (!doc || doc.trashedAt || doc._status !== 'published') return null
  return doc
}

export const getNotFoundPage = cache(async (): Promise<Page | null> => {
  const config = await getSitePages()
  return loadPublishedPage(config.notFoundPageId)
})

/** The public path of the privacy policy page, used by the cookie banner when its own URL is blank. */
export const getPrivacyPolicyPath = cache(async (): Promise<string | null> => {
  const config = await getSitePages()
  if (!config.privacyPolicyPageId) return null
  return pathForPage(config.privacyPolicyPageId, await getAllResolvedPages())
})

/** True when the signed-in visitor is an admin (same role check as src/admin/auth.ts isAdminUser). */
export const isSignedInAdmin = async (): Promise<boolean> => {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: await headers() }).catch(() => ({ user: null as unknown }))
  return Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
}
