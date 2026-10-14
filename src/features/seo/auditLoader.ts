import { AUDIT_COLLECTIONS, buildAuditRow, type AuditCollection, type AuditRow } from './audit'

/** Most documents read per collection. Anything beyond this is not audited. */
export const AUDIT_LIMIT_PER_COLLECTION = 500

export type AuditFindEngine = {
  find(args: {
    collection: string
    where?: Record<string, unknown>
    limit?: number
    depth?: number
    overrideAccess?: boolean
  }): Promise<{ docs: unknown[] }>
}

/**
 * Reads the published, non-trashed documents of each allowed collection and
 * turns them into audit rows. The caller checks the user's permission and
 * passes only the collections they may read.
 */
export async function loadAuditRows(
  engine: AuditFindEngine,
  collections: readonly AuditCollection[] = AUDIT_COLLECTIONS,
): Promise<AuditRow[]> {
  const rows: AuditRow[] = []
  for (const collection of collections) {
    const { docs } = await engine.find({
      collection,
      where: { _status: { equals: 'published' } },
      limit: AUDIT_LIMIT_PER_COLLECTION,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of docs) {
      const record = doc as Record<string, unknown>
      if (record.trashedAt) continue
      rows.push(buildAuditRow(record, collection))
    }
  }
  return rows
}
