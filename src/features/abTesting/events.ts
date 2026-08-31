import { getCloudflareContext } from '@opennextjs/cloudflare'

import { AB_EVENTS_TABLE, AB_STATS_TABLE } from './slugs'

/**
 * Everything this feature writes on the visitor path.
 *
 * Two tables, and the split is deliberate:
 *
 *   eg_ab_events is an append-only log. It is the audit trail - what was
 *   served to whom and when - and it is what makes a disputed result
 *   re-checkable. Nothing on a page render reads it.
 *
 *   eg_ab_stats is the rollup the results screen reads: one row per
 *   (test, variant, goal), holding running totals. A test with three arms and
 *   four goals is fifteen rows, so the screen is a single indexed read no
 *   matter how large the test gets. Aggregating the log instead would mean a
 *   GROUP BY over every visitor the test has ever had, every time somebody
 *   opens the screen.
 *
 * Write volume is the thing that decides whether this is affordable, and the
 * answer is in what is NOT written:
 *
 *   - No row per page view. An impression is written once per visitor per
 *     test, the first time they are bucketed, because the cookie already knows
 *     they have been counted. A visitor who reads forty pages writes once.
 *   - No row per repeat conversion. The cookie carries a dedupe set, so a
 *     goal counts once per visitor.
 *   - Nothing is written at all for a page with no test on it, and nothing for
 *     a visitor already counted.
 *
 * Every write is best-effort. A failed counter must never take a page down:
 * losing an impression skews a percentage slightly, refusing to render loses
 * the visitor entirely.
 */

type RunResult = { meta?: { changes?: number } }
type Bound = { run: () => Promise<RunResult>; all: <T>() => Promise<{ results?: T[] }> }
type D1Like = { prepare: (statement: string) => { bind: (...values: unknown[]) => Bound } }

let warned = false

const getDb = async (): Promise<D1Like | null> => {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return ((env as { D1?: D1Like }).D1 as D1Like) ?? null
  } catch {
    if (!warned) {
      warned = true
      console.warn('[ab] No database binding in this environment - events are not being recorded.')
    }
    return null
  }
}

// OR IGNORE against the unique index on (test, variant, goal, visitor). The
// cookie is what stops the write being attempted twice; this is what stops a
// counter being wrong when there is no cookie to consult - a server-scored
// order conversion, a visitor who cleared their cookies mid-session, a retry.
const EVENT_SQL = `INSERT OR IGNORE INTO \`${AB_EVENTS_TABLE}\`
  (\`test_id\`, \`variant_key\`, \`goal_key\`, \`visitor_id\`, \`value\`, \`created_at\`)
  VALUES (?, ?, ?, ?, ?, ?)`

// The goal column is '' on the impression row rather than NULL, because SQLite
// treats NULLs as distinct in a unique index and every impression would then
// insert a new row instead of incrementing the existing one.
const STATS_SQL = `INSERT INTO \`${AB_STATS_TABLE}\`
  (\`test_id\`, \`variant_key\`, \`goal_key\`, \`visitors\`, \`conversions\`, \`value_total\`, \`updated_at\`)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(\`test_id\`, \`variant_key\`, \`goal_key\`) DO UPDATE SET
    \`visitors\` = \`visitors\` + excluded.\`visitors\`,
    \`conversions\` = \`conversions\` + excluded.\`conversions\`,
    \`value_total\` = \`value_total\` + excluded.\`value_total\`,
    \`updated_at\` = excluded.\`updated_at\``

/**
 * Log first, then increment - and only increment if the log actually took the
 * row. Batching both would be one round trip instead of two, but the rollup
 * would then be incremented even when the unique index rejected the event, and
 * a counter that can drift upward on a retry is a counter nobody can trust.
 * Both statements run after the response has been sent, so the extra round
 * trip costs the visitor nothing.
 */
const write = async (
  db: D1Like,
  testId: string,
  variantKey: string,
  goalKey: string,
  visitorId: string,
  value: number,
  visitorDelta: number,
  conversionDelta: number,
): Promise<void> => {
  const now = new Date().toISOString()
  try {
    const inserted = await db.prepare(EVENT_SQL).bind(testId, variantKey, goalKey, visitorId, value, now).run()
    if ((inserted?.meta?.changes ?? 1) === 0) return

    await db
      .prepare(STATS_SQL)
      .bind(testId, variantKey, goalKey, visitorDelta, conversionDelta, value, now)
      .run()
  } catch (error) {
    console.warn('[ab] Could not record an event:', error instanceof Error ? error.message : error)
  }
}

/** One row the first time a visitor is bucketed into a test. Never on later views. */
export const recordImpression = async (
  testId: string,
  variantKey: string,
  visitorId: string,
): Promise<void> => {
  const db = await getDb()
  if (!db) return
  await write(db, testId, variantKey, '', visitorId, 0, 1, 0)
}

/**
 * One row the first time a visitor hits a goal.
 *
 * `value` carries the order total for an order-placed goal and is zero for the
 * rest, so revenue per variant comes out of the same rollup as the counts
 * rather than needing a second join back into the shop.
 */
export const recordConversionEvent = async (
  testId: string,
  variantKey: string,
  goalKey: string,
  visitorId: string,
  value = 0,
): Promise<void> => {
  const db = await getDb()
  if (!db) return
  await write(db, testId, variantKey, goalKey, visitorId, Number.isFinite(value) ? value : 0, 0, 1)
}

export type StatRow = {
  test_id: string
  variant_key: string
  goal_key: string
  visitors: number
  conversions: number
  value_total: number
}

/** The rollup for one test. A handful of rows, read by the results screen. */
export const readStats = async (testId: string): Promise<StatRow[]> => {
  const db = await getDb()
  if (!db) return []
  try {
    const result = await db
      .prepare(`SELECT * FROM \`${AB_STATS_TABLE}\` WHERE \`test_id\` = ?`)
      .bind(testId)
      .all<StatRow>()
    return result.results ?? []
  } catch {
    return []
  }
}
