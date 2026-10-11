import { TaxRates } from '@/features/ecommerce/collections/TaxRates'

import { createCollectionOps } from '../generic'
import { taxRates } from '../schema/taxRates'

/** Loosely typed document for the `tax-rates` collection - see src/features/ecommerce/collections/TaxRates.ts. */
export type TaxRateDoc = { id: number; updatedAt: string; createdAt: string } & Record<string, unknown>

const ops = createCollectionOps(taxRates, TaxRates)

export const findTaxRates = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<TaxRateDoc[]>
export const findTaxRatesPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findTaxRateByID = ops.findByID as unknown as (id: number) => Promise<TaxRateDoc | null>
export const countTaxRates = ops.count
export const createTaxRate = ops.create as unknown as (data: Record<string, unknown>) => Promise<TaxRateDoc>
export const updateTaxRate = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<TaxRateDoc | null>
export const deleteTaxRate = ops.deleteByID
