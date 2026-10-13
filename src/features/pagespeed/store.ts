import { sql } from 'drizzle-orm'

import type { Drizzle } from '@/localapi/migrate'

import { safeJson } from './parse'
import {
  COLLECTION_TABLES,
  PAGESPEED_RESULTS_TABLE,
  type PageSpeedCollection,
  type PageSpeedReport,
  type StoredResult,
  type Strategy,
} from './types'

/**
 * Data access for `eg_pagespeed_results` (one row per completed test) and the denormalised
 * `pagespeed_score` / `pagespeed_at` columns the list views read. Raw SQL on the same db handle as
 * the other custom tables (scheduledPublishes, ad stats).
 */

/** Past runs kept per document and strategy. Older ones are dropped on insert. */
export const KEEP_PER_DOC = 60

type Row = {
  id: number
  collection: string
  doc_id: number
  url: string
  strategy: string
  performance: number | null
  accessibility: number | null
  best_practices: number | null
  seo: number | null
  metrics: string | null
  field_data: string | null
  suggestions: string | null
  source: string
  fetched_at: string
}

const parse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return (JSON.parse(value) as T) ?? fallback
  } catch {
    return fallback
  }
}

export function rowToResult(row: Row): StoredResult {
  return {
    id: Number(row.id),
    collection: row.collection as PageSpeedCollection,
    docId: Number(row.doc_id),
    url: row.url,
    strategy: row.strategy as Strategy,
    source: row.source === 'auto' ? 'auto' : 'manual',
    fetchedAt: row.fetched_at,
    scores: { performance: row.performance, accessibility: row.accessibility, bestPractices: row.best_practices, seo: row.seo },
    metrics: parse(row.metrics, {}),
    fieldData: parse(row.field_data, null),
    suggestions: parse(row.suggestions, { opportunities: [], diagnostics: [] }),
  }
}

/** Saves a finished test, trims old history and refreshes the document's list column. Returns the stored row. */
export async function saveResult(
  db: Drizzle,
  input: { collection: PageSpeedCollection; docId: number; url: string; strategy: Strategy; source: 'manual' | 'auto'; report: PageSpeedReport; now?: Date },
): Promise<StoredResult> {
  const fetchedAt = (input.now ?? new Date()).toISOString()
  const { report } = input
  await db.run(
    sql`INSERT INTO \`eg_pagespeed_results\`
      (collection, doc_id, url, strategy, performance, accessibility, best_practices, seo, metrics, field_data, suggestions, source, fetched_at)
      VALUES (${input.collection}, ${input.docId}, ${input.url}, ${input.strategy}, ${report.scores.performance}, ${report.scores.accessibility},
        ${report.scores.bestPractices}, ${report.scores.seo}, ${safeJson(report.metrics, 3000)}, ${safeJson(report.fieldData, 2000)},
        ${safeJson(report.suggestions)}, ${input.source}, ${fetchedAt})`,
  )
  const idRow = (await db.all(sql`SELECT last_insert_rowid() AS id`)) as { id: number }[]
  const id = Number(idRow[0]?.id ?? 0)

  await db.run(
    sql`DELETE FROM \`eg_pagespeed_results\` WHERE collection = ${input.collection} AND doc_id = ${input.docId} AND strategy = ${input.strategy}
      AND id NOT IN (SELECT id FROM \`eg_pagespeed_results\` WHERE collection = ${input.collection} AND doc_id = ${input.docId} AND strategy = ${input.strategy} ORDER BY fetched_at DESC, id DESC LIMIT ${KEEP_PER_DOC})`,
  )

  await refreshListColumn(db, input.collection, input.docId, input.strategy, report.scores.performance, fetchedAt)

  return { ...report, id, collection: input.collection, docId: input.docId, url: input.url, strategy: input.strategy, source: input.source, fetchedAt }
}

/**
 * The list columns show one number per document: the mobile score (what Google ranks on). A desktop
 * run only fills the column while there is no mobile result for the document.
 */
export async function refreshListColumn(
  db: Drizzle,
  collection: PageSpeedCollection,
  docId: number,
  strategy: Strategy,
  performance: number | null,
  fetchedAt: string,
): Promise<void> {
  if (performance === null) return
  if (strategy === 'desktop') {
    const mobile = (await db.all(
      sql`SELECT 1 AS present FROM \`eg_pagespeed_results\` WHERE collection = ${collection} AND doc_id = ${docId} AND strategy = 'mobile' AND performance IS NOT NULL LIMIT 1`,
    )) as unknown[]
    if (mobile.length > 0) return
  }
  const table = COLLECTION_TABLES[collection]
  // The table name comes from the fixed COLLECTION_TABLES map; every value is a bound parameter.
  await db.run(sql`UPDATE ${sql.raw(`\`${table}\``)} SET \`pagespeed_score\` = ${Math.round(performance)}, \`pagespeed_at\` = ${fetchedAt} WHERE \`id\` = ${Math.trunc(docId)}`)
}

/** Newest first. */
export async function listHistory(db: Drizzle, collection: PageSpeedCollection, docId: number, strategy: Strategy, limit = 30): Promise<StoredResult[]> {
  const rows = (await db.all(
    sql`SELECT * FROM \`eg_pagespeed_results\` WHERE collection = ${collection} AND doc_id = ${docId} AND strategy = ${strategy} ORDER BY fetched_at DESC, id DESC LIMIT ${Math.max(1, Math.min(limit, KEEP_PER_DOC))}`,
  )) as Row[]
  return rows.map(rowToResult)
}

/** Runs recorded since `sinceIso`, optionally only automatic ones. Used for the daily cap and the cool-down. */
export async function countSince(db: Drizzle, sinceIso: string, source?: 'manual' | 'auto'): Promise<number> {
  const rows = (await (source
    ? db.all(sql`SELECT COUNT(*) AS n FROM \`eg_pagespeed_results\` WHERE fetched_at >= ${sinceIso} AND source = ${source}`)
    : db.all(sql`SELECT COUNT(*) AS n FROM \`eg_pagespeed_results\` WHERE fetched_at >= ${sinceIso}`))) as { n: number }[]
  return Number(rows[0]?.n ?? 0)
}

export async function latestFetchedAt(db: Drizzle, collection: PageSpeedCollection, docId: number, strategy: Strategy): Promise<string | null> {
  const rows = (await db.all(
    sql`SELECT fetched_at FROM \`eg_pagespeed_results\` WHERE collection = ${collection} AND doc_id = ${docId} AND strategy = ${strategy} ORDER BY fetched_at DESC LIMIT 1`,
  )) as { fetched_at: string }[]
  return rows[0]?.fetched_at ?? null
}

export type WorstRow = {
  collection: PageSpeedCollection
  docId: number
  url: string
  performance: number
  fetchedAt: string
  /** The stored suggestions JSON for that run (null when none was kept). */
  suggestions: string | null
}

/** The worst-scoring pages for the overview: the latest run per page for one strategy, lowest score first. */
export async function listWorst(db: Drizzle, limit = 10, strategy: Strategy = 'mobile'): Promise<WorstRow[]> {
  const rows = (await db.all(
    sql`SELECT r.collection, r.doc_id, r.url, r.performance, r.fetched_at, r.suggestions FROM \`eg_pagespeed_results\` r
      WHERE r.strategy = ${strategy} AND r.performance IS NOT NULL
        AND r.id = (SELECT MAX(r2.id) FROM \`eg_pagespeed_results\` r2 WHERE r2.collection = r.collection AND r2.doc_id = r.doc_id AND r2.strategy = ${strategy})
      ORDER BY r.performance ASC, r.fetched_at ASC LIMIT ${Math.max(1, Math.min(limit, 50))}`,
  )) as { collection: string; doc_id: number; url: string; performance: number; fetched_at: string; suggestions: string | null }[]
  return rows.map((r) => ({
    collection: r.collection as PageSpeedCollection,
    docId: Number(r.doc_id),
    url: r.url,
    performance: Number(r.performance),
    fetchedAt: r.fetched_at,
    suggestions: r.suggestions ?? null,
  }))
}

export const RESULTS_TABLE = PAGESPEED_RESULTS_TABLE
