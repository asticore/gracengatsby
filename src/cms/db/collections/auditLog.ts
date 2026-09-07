import { AuditLog } from '@/features/security/auditLogCollection'

import { createCollectionOps } from '../generic'
import { auditLog } from '../schema'

/** Payload's document shape for the `audit-log` collection - see src/features/security/auditLogCollection.ts. */
export type AuditLogDoc = {
  id: number
  action: string
  actorId?: number | null
  actorEmail?: string | null
  collectionSlug?: string | null
  documentId?: string | null
  ip?: string | null
  userAgent?: string | null
  detail?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(auditLog, AuditLog)

export const findAuditLogEntries = ops.findMany as unknown as (args?: {
  where?: import('@/engine').Where
  limit?: number
}) => Promise<AuditLogDoc[]>
export const findAuditLogEntryByID = ops.findByID as unknown as (id: number) => Promise<AuditLogDoc | null>
export const countAuditLogEntries = ops.count
export const createAuditLogEntry = ops.create as unknown as (
  data: Partial<Omit<AuditLogDoc, 'id' | 'updatedAt' | 'createdAt'>> & { action: string },
) => Promise<AuditLogDoc>
export const updateAuditLogEntry = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<AuditLogDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<AuditLogDoc | null>
export const deleteAuditLogEntry = ops.deleteByID
