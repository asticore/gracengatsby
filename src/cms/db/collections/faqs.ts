import { Faqs } from '@/collections/Faqs'

import { createCollectionOps } from '../generic'
import { faqs } from '../schema'

/** Payload's document shape for the `faqs` collection - see src/collections/Faqs.ts. */
export type FaqDoc = {
  id: number
  question: string
  answer: unknown
  category?: string | null
  order?: number | null
  customFields?: Record<string, unknown> | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(faqs, Faqs)

export const findFaqs = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<FaqDoc[]>
export const findFaqByID = ops.findByID as unknown as (id: number) => Promise<FaqDoc | null>
export const countFaqs = ops.count
export const createFaq = ops.create as unknown as (
  data: Partial<Omit<FaqDoc, 'id' | 'updatedAt' | 'createdAt'>> & { question: string; answer: unknown },
) => Promise<FaqDoc>
export const updateFaq = ops.updateByID as unknown as (id: number, data: Partial<Omit<FaqDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<FaqDoc | null>
export const deleteFaq = ops.deleteByID
