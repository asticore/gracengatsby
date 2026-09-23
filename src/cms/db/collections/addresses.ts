import type { Sort, Where } from '@/engine'

import { Addresses } from '@/features/ecommerce/collections/Addresses'

import { createCollectionOps } from '../generic'
import { addresses } from '../schema'

/** Payload's document shape for the `addresses` collection - see src/features/ecommerce/collections/Addresses.ts. */
export type AddressDoc = {
  id: number
  customer?: number | null
  title?: string | null
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country: string
  phone?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(addresses, Addresses)

export const findAddresses = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<AddressDoc[]>
export const findAddressesPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findAddressByID = ops.findByID as unknown as (id: number) => Promise<AddressDoc | null>
export const countAddresses = ops.count
export const createAddress = ops.create as unknown as (
  data: Partial<Omit<AddressDoc, 'id' | 'updatedAt' | 'createdAt'>> & { country: string },
) => Promise<AddressDoc>
export const updateAddress = ops.updateByID as unknown as (id: number, data: Partial<Omit<AddressDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<AddressDoc | null>
export const deleteAddress = ops.deleteByID
