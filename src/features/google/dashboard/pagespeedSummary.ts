import { adminCollectionPath } from '@/admin/adminPaths'
import { sql } from 'drizzle-orm'

import type { Drizzle } from '@/localapi/migrate'

import { cached } from './cache'
import type { SpeedSummary, WidgetState } from './types'

/**
 * PageSpeed summary from the results the PageSpeed feature already stores. No Google call and no
 * connection needed: the latest mobile test per page, the average, and the five lowest pages.
 */

type Latest = { collection: string; docId: number; url: string; performance: number }

/** Pure: builds the summary from latest-per-page rows. */
export function summarisePageSpeed(rows: Latest[], limit = 5): SpeedSummary {
  const sorted = [...rows].sort((a, b) => a.performance - b.performance)
  const average = rows.length ? rows.reduce((total, r) => total + r.performance, 0) / rows.length : null
  return {
    tested: rows.length,
    averagePerformance: average === null ? null : Math.round(average),
    worst: sorted.slice(0, limit).map((r) => ({
      collection: r.collection,
      docId: r.docId,
      url: r.url,
      performance: r.performance,
      editHref: `${adminCollectionPath(r.collection)}/${r.docId}`,
    })),
  }
}

/** Latest mobile performance score for each tested document. */
async function readLatest(db: Drizzle): Promise<Latest[]> {
  const rows = (await db.all(
    sql`SELECT r.collection, r.doc_id, r.url, r.performance FROM \`eg_pagespeed_results\` r
      WHERE r.strategy = 'mobile' AND r.performance IS NOT NULL
        AND r.id = (SELECT MAX(r2.id) FROM \`eg_pagespeed_results\` r2 WHERE r2.collection = r.collection AND r2.doc_id = r.doc_id AND r2.strategy = 'mobile')`,
  )) as { collection: string; doc_id: number; url: string; performance: number }[]
  return rows.map((r) => ({ collection: r.collection, docId: Number(r.doc_id), url: r.url, performance: Number(r.performance) }))
}

export async function loadSpeedWidget(db: Drizzle): Promise<WidgetState<SpeedSummary>> {
  try {
    const data = await cached('speed', async () => summarisePageSpeed(await readLatest(db)), () => true)
    return { state: 'ok', data }
  } catch {
    return { state: 'error', message: 'Could not read the stored PageSpeed results. Try again in a minute.' }
  }
}
