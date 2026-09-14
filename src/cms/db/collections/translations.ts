import type { Sort } from '@/engine'

import { Translations } from '@/features/multilingual/translationsCollection'

import { createCollectionOps } from '../generic'
import { translations } from '../schema'

/** Payload's document shape for the `translations` collection - see src/features/multilingual/translationsCollection.ts. */
export type TranslationDoc = {
  id: number
  locale: string
  sourceKind: string
  sourceId: string
  fieldPath: string
  value?: string | null
  sourceText?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(translations, Translations)

export const findTranslations = ops.findMany as unknown as (args?: {
  where?: import('@/engine').Where
  limit?: number
}) => Promise<TranslationDoc[]>
export const findTranslationByID = ops.findByID as unknown as (id: number) => Promise<TranslationDoc | null>
export const countTranslations = ops.count
export const createTranslation = ops.create as unknown as (
  data: Partial<Omit<TranslationDoc, 'id' | 'updatedAt' | 'createdAt'>> & {
    locale: string
    sourceKind: string
    sourceId: string
    fieldPath: string
  },
) => Promise<TranslationDoc>
export const updateTranslation = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<TranslationDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<TranslationDoc | null>
export const deleteTranslation = ops.deleteByID

// The paginated find shape the engine.db.ts cutover's adapter intercept needs
// (find/findOne/deleteOne's own resolve-then-act) - same re-export pattern as
// Faqs' findFaqsPaginated, no new logic.
export const findTranslationsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
