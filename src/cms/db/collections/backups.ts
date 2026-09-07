import { Backups } from '@/features/backups/collection'

import { createCollectionOps } from '../generic'
import { backups } from '../schema'

/**
 * Payload's document shape for the `backups` collection - see
 * src/features/backups/collection.ts. Scalar-only, same shape class as Faqs:
 * no arrays/rels/blocks/joins/select fields, so `createCollectionOps` needs
 * no extra options. `startedAt`/`finishedAt` are Payload `date` fields,
 * stored (and read back) as ISO date strings, same as `startDate` on Events.
 */
export type BackupDoc = {
  id: number
  backupId?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  triggerSource?: string | null
  contents?: string | null
  destination?: string | null
  storagePath?: string | null
  status?: string | null
  sizeBytes?: number | null
  tablesBackedUp?: number | null
  mediaObjects?: number | null
  error?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(backups, Backups)

export const findBackups = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<BackupDoc[]>
export const findBackupByID = ops.findByID as unknown as (id: number) => Promise<BackupDoc | null>
export const countBackups = ops.count
export const createBackup = ops.create as unknown as (
  data: Partial<Omit<BackupDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<BackupDoc>
export const updateBackup = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<BackupDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<BackupDoc | null>
export const deleteBackup = ops.deleteByID
