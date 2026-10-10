import { getDb } from '@/cms/db/connect'
import { getPasswordHash } from '@/cms/db/contentPasswords'

/**
 * The "may this document be listed publicly" checks shared by the sitemap and
 * the llms.txt builders, so the two can never disagree about a page.
 */

/** A page the author marked as noindex on its own SEO tab. */
export const isNoIndexedPage = (page: { seo?: { noIndex?: boolean | null } | null }): boolean =>
  Boolean(page.seo?.noIndex)

/**
 * Whether a document sits behind a password. Only pages and posts can be
 * protected (see features/visibility/gate.ts). This throws when the lookup
 * fails: each caller decides whether a failed check means "listed" or "hidden".
 */
export const readPasswordGate = async (collection: 'pages' | 'posts', docId: number): Promise<boolean> => {
  const db = await getDb()
  const hash = await getPasswordHash(db, collection, docId)
  return hash !== null
}
