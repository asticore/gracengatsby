import { getCloudflareContext } from '@opennextjs/cloudflare'

import { AD_STATS_TABLE } from './slugs'
import { ctrOf, type ReportRow, type TrackEvent } from './track'

type Bound = { run: () => Promise<unknown>; all: <T>() => Promise<{ results?: T[] }> }
type D1Like = { prepare: (s: string) => { bind: (...v: unknown[]) => Bound } }

const getDb = async (): Promise<D1Like | null> => {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return ((env as { D1?: D1Like }).D1 as D1Like) ?? null
  } catch {
    return null
  }
}

const UPSERT = `INSERT INTO \`${AD_STATS_TABLE}\` (unit_key, day, bp, impressions, clicks) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(unit_key, day, bp) DO UPDATE SET impressions = impressions + excluded.impressions, clicks = clicks + excluded.clicks`

export async function recordAdEvent(event: TrackEvent, day: string): Promise<boolean> {
  const db = await getDb()
  if (!db) return false
  try {
    await db.prepare(UPSERT).bind(event.unit, day, event.bp, event.event === 'v' ? 1 : 0, event.event === 'c' ? 1 : 0).run()
    return true
  } catch {
    return false
  }
}

export async function readReport(from: string, to: string): Promise<ReportRow[]> {
  const db = await getDb()
  if (!db) return []
  try {
    const { results } = await db
      .prepare(`SELECT unit_key AS unit, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM \`${AD_STATS_TABLE}\` WHERE day >= ? AND day <= ? GROUP BY unit_key ORDER BY impressions DESC`)
      .bind(from, to)
      .all<{ unit: string; impressions: number; clicks: number }>()
    return (results ?? []).map((r) => ({ unit: r.unit, impressions: Number(r.impressions), clicks: Number(r.clicks), ctr: ctrOf(Number(r.impressions), Number(r.clicks)) }))
  } catch {
    return []
  }
}

export async function readDaily(from: string, to: string): Promise<{ day: string; impressions: number }[]> {
  const db = await getDb()
  if (!db) return []
  try {
    const { results } = await db
      .prepare(`SELECT day, SUM(impressions) AS impressions FROM \`${AD_STATS_TABLE}\` WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`)
      .bind(from, to)
      .all<{ day: string; impressions: number }>()
    return (results ?? []).map((r) => ({ day: r.day, impressions: Number(r.impressions) }))
  } catch {
    return []
  }
}
