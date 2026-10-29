import { cache } from 'react'

import { getEngine } from '@/lib/engine'

import { findTranslations, type TranslationRow } from './store'

/**
 * One bulk read of a locale's collection rows, memoised for the request. Shared by
 * the overlay (applyTranslations.ts) and the translated-slug index (slugIndex.ts),
 * so a page that needs both still reads the table once.
 */
export const loadLocaleRows = cache(async (locale: string): Promise<TranslationRow[]> => {
  const engine = await getEngine()
  return findTranslations(engine as unknown as Parameters<typeof findTranslations>[0], {
    locale,
    sourceKind: 'collection',
  })
})
