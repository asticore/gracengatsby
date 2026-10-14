import type { Sort, Where } from '@/engine'

import { EmailLog } from '@/collections/EmailLog'

import { createCollectionOps } from '../generic'
import { emailLog } from '../schema'

/** The document shape for the `email-log` collection - see src/collections/EmailLog.ts. */
export type EmailLogDoc = {
  id: number
  to: string
  subject: string
  template?: string | null
  provider?: string | null
  status: 'sent' | 'failed' | 'skipped'
  error?: string | null
  html?: string | null
  text?: string | null
  resentFrom?: number | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(emailLog, EmailLog)

export const findEmailLogEntries = ops.findMany as unknown as (args?: { where?: Where; limit?: number; sort?: string }) => Promise<EmailLogDoc[]>
export const findEmailLogEntryByID = ops.findByID as unknown as (id: number) => Promise<EmailLogDoc | null>
export const countEmailLogEntries = ops.count
export const createEmailLogEntry = ops.create as unknown as (
  data: Partial<Omit<EmailLogDoc, 'id' | 'updatedAt' | 'createdAt'>> & { to: string; subject: string; status: EmailLogDoc['status'] },
) => Promise<EmailLogDoc>
export const updateEmailLogEntry = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<EmailLogDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EmailLogDoc | null>
export const deleteEmailLogEntry = ops.deleteByID

// The paginated find shape the engine cutover's adapter intercept needs - same re-export pattern as auditLog.ts.
export const findEmailLogEntriesPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
