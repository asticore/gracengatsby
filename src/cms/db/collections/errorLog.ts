import type { Sort, Where } from '@/engine'

import { ErrorLog } from '@/collections/ErrorLog'

import { createCollectionOps } from '../generic'
import { errorLog } from '../schema'

/** The document shape for the `error-log` collection - see src/collections/ErrorLog.ts. */
export type ErrorLogDoc = {
  id: number
  source: string
  message: string
  stack?: string | null
  path?: string | null
  userAgent?: string | null
  count: number
  firstSeen?: string | null
  lastSeen?: string | null
  fingerprint?: string | null
  status: 'open' | 'ignored' | 'fixed'
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(errorLog, ErrorLog)

export const findErrorLogEntries = ops.findMany as unknown as (args?: { where?: Where; limit?: number; sort?: string }) => Promise<ErrorLogDoc[]>
export const findErrorLogEntryByID = ops.findByID as unknown as (id: number) => Promise<ErrorLogDoc | null>
export const countErrorLogEntries = ops.count
export const createErrorLogEntry = ops.create as unknown as (
  data: Partial<Omit<ErrorLogDoc, 'id' | 'updatedAt' | 'createdAt'>> & { source: string; message: string },
) => Promise<ErrorLogDoc>
export const updateErrorLogEntry = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<ErrorLogDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ErrorLogDoc | null>
export const deleteErrorLogEntry = ops.deleteByID

// The paginated find shape the engine cutover's adapter intercept needs - same re-export pattern as emailLog.ts.
export const findErrorLogEntriesPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>