import type { Drizzle } from '@/localapi/migrate'
import { assertDocAccess } from '@/features/roles/docAccess'

import { listWorst } from './store'
import { scoreBand, type Band, type PageSpeedCollection, type Strategy, isPageSpeedCollection } from './types'

/**
 * "Slowest pages": the lowest-scoring documents across the site, from the stored PageSpeed results.
 * Only the latest run per document counts. Each row is checked against the viewer's own access, so a
 * user never sees a page they cannot open.
 */

export const WORST_LIMIT = 10
/** How many rows to read before the access filter, so a filtered list can still fill up to WORST_LIMIT. */
const CANDIDATES = 50
const AUDITS_PER_ROW = 2

export type FailingAudit = { id: string; title: string; displayValue: string | null }

export type WorstPage = {
  collection: PageSpeedCollection
  docId: number
  title: string
  url: string
  score: number
  band: Band | null
  lastRun: string
  editHref: string
  failingAudits: FailingAudit[]
}

/** The subset of the admin context this needs. getAdminContext() satisfies it. */
export type WorstContext = {
  isAdmin?: boolean
  user?: unknown
  can: (resource: string, action: 'read' | 'update') => boolean
  permissions: { collections?: Record<string, Record<string, boolean | undefined> | undefined> }
  engine: { findByID: (args: Record<string, unknown>) => Promise<unknown> }
}

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Reads the stored suggestions and returns the first two failing audits: biggest savings first, then diagnostics. */
export function failingAuditsFrom(raw: string | null): FailingAudit[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const data = parsed as { opportunities?: unknown; diagnostics?: unknown } | null
  const list = [...(Array.isArray(data?.opportunities) ? data.opportunities : []), ...(Array.isArray(data?.diagnostics) ? data.diagnostics : [])]
  const out: FailingAudit[] = []
  for (const item of list) {
    const audit = item as { id?: unknown; title?: unknown; displayValue?: unknown }
    const id = asText(audit.id)
    const title = asText(audit.title)
    if (!id || !title) continue
    out.push({ id, title, displayValue: asText(audit.displayValue) })
    if (out.length === AUDITS_PER_ROW) break
  }
  return out
}

/** Whether the viewer may read this collection at all (admins always may). */
function canReadCollection(context: WorstContext, collection: PageSpeedCollection): boolean {
  if (context.isAdmin) return true
  return context.can('admin-pagespeed', 'read') && Boolean(context.permissions.collections?.[collection]?.read)
}

/** Title for the row: the document's title or name. Null when the document no longer exists. */
async function titleOf(context: WorstContext, collection: PageSpeedCollection, docId: number): Promise<string | null | undefined> {
  try {
    const doc = (await context.engine.findByID({ collection, id: docId, depth: 0, overrideAccess: true })) as Record<string, unknown> | null
    if (!doc) return null
    return asText(doc.title) ?? asText(doc.name) ?? ''
  } catch {
    return undefined
  }
}

export async function getWorstPages(opts: { db: Drizzle; context: WorstContext; strategy?: Strategy; limit?: number }): Promise<WorstPage[]> {
  const strategy: Strategy = opts.strategy ?? 'mobile'
  const limit = Math.max(1, Math.min(opts.limit ?? WORST_LIMIT, WORST_LIMIT))
  const candidates = await listWorst(opts.db, CANDIDATES, strategy)

  const out: WorstPage[] = []
  for (const row of candidates) {
    if (out.length >= limit) break
    if (!isPageSpeedCollection(row.collection)) continue
    if (!canReadCollection(opts.context, row.collection)) continue
    const access = await assertDocAccess(opts.context, row.collection, row.docId, 'read')
    if (!access.ok) continue

    const title = await titleOf(opts.context, row.collection, row.docId)
    // A missing document is left out. A lookup error still shows the row, using the stored URL.
    if (title === null) continue

    out.push({
      collection: row.collection,
      docId: row.docId,
      title: title || row.url,
      url: row.url,
      score: Math.round(row.performance),
      band: scoreBand(row.performance),
      lastRun: row.fetchedAt,
      editHref: `/admin/collections/${row.collection}/${row.docId}`,
      failingAudits: failingAuditsFrom(row.suggestions),
    })
  }
  return out
}
