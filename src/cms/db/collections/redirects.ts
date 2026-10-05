import { Redirects } from '@/features/redirects/collection'

import { createCollectionOps } from '../generic'
import { redirects } from '../schema/redirects'

/** The original engine's document shape for the `redirects` collection - see src/features/redirects/collection.ts. */
export type RedirectDoc = {
  id: number
  fromPath: string
  toPath: string
  redirectType: '301' | '302' | '307' | '308'
  enabled?: boolean | null
  note?: string | null
  hitCount?: number | null
  lastHit?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(redirects, Redirects)

export const findRedirects = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<RedirectDoc[]>
/**
 * The adapter-shaped counterpart to findRedirects (see ../generic.ts's
 * findPaginated doc comment) - what src/localapi/registry.ts's per-collection
 * adapter intercept calls for Redirects' `find`, since the original engine's own list views
 * and API queries always pass sort/pagination, however simple the
 * collection's fields are.
 */
export const findRedirectsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findRedirectByID = ops.findByID as unknown as (id: number) => Promise<RedirectDoc | null>
export const countRedirects = ops.count
export const createRedirect = ops.create as unknown as (
  data: Partial<Omit<RedirectDoc, 'id' | 'updatedAt' | 'createdAt'>> & { fromPath: string; toPath: string; redirectType: '301' | '302' | '307' | '308' },
) => Promise<RedirectDoc>
export const updateRedirect = ops.updateByID as unknown as (id: number, data: Partial<Omit<RedirectDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<RedirectDoc | null>
export const deleteRedirect = ops.deleteByID
