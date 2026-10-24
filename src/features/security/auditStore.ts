import { resolveD1Binding } from '@/cms/db/connect'

import { AUDIT_PAGE_SIZE, buildAuditSelect, type AuditFilter } from './auditQuery'

/**
 * Reads one page of account-security events for the admin review screen.
 * Server-only: it reaches D1. Writes are not here - they go through
 * recordAuthEvent (see authAudit.ts) and nothing edits or removes a row.
 */

export type AuthAuditRow = {
  id: number
  action: string
  actorId: number | null
  actorEmail: string | null
  collectionSlug: string | null
  documentId: string | null
  ip: string | null
  userAgent: string | null
  detail: string | null
  createdAt: string
}

type Raw = {
  id: number
  action: string
  actor_id: number | null
  actor_email: string | null
  collection_slug: string | null
  document_id: string | null
  ip: string | null
  user_agent: string | null
  detail: string | null
  created_at: string
}

const toRow = (raw: Raw): AuthAuditRow => ({
  id: Number(raw.id),
  action: raw.action,
  actorId: raw.actor_id === null ? null : Number(raw.actor_id),
  actorEmail: raw.actor_email,
  collectionSlug: raw.collection_slug,
  documentId: raw.document_id,
  ip: raw.ip,
  userAgent: raw.user_agent,
  detail: raw.detail,
  createdAt: raw.created_at,
})

export async function listAuthAuditPage(filter: AuditFilter, pageSize = AUDIT_PAGE_SIZE): Promise<{ rows: AuthAuditRow[]; hasNext: boolean }> {
  const d1 = await resolveD1Binding()
  const { sql, binds } = buildAuditSelect(filter, pageSize)
  const result = await d1.prepare(sql).bind(...binds).all<Raw>()
  const raw = result.results ?? []
  return { rows: raw.slice(0, pageSize).map(toRow), hasNext: raw.length > pageSize }
}
