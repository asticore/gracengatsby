import type { Metadata } from 'next'

import { buildMetadata } from '@/utilities/seo'

/**
 * Titles for the account screens, all of them marked no-index.
 *
 * Nothing under /account should ever appear in a search result: half of it is
 * per-customer, and the other half - sign in, reset - is a login surface that
 * gains nothing from being crawled and attracts credential-stuffing traffic
 * when it is.
 */
export const accountMetadata = async (title: string): Promise<Metadata> =>
  buildMetadata({ title, seo: { noIndex: true } })
