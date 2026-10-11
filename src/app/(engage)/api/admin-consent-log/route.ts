import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { isFilterCategory, parseAuditRows, filterRecords, recordsToCsv, summarise, type ConsentLogRecord } from '@/features/consent/logStats'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_PAGE = 1000
/** Most rows read to build the totals and the chart. */
const SUMMARY_SCAN = 5000
/** Most rows in one CSV export. */
const EXPORT_MAX = 10_000
const SUMMARY_DAYS = 30

type FindResult = { docs: Array<Record<string, unknown>>; totalDocs?: number }
type FindEngine = { find: (args: Record<string, unknown>) => Promise<FindResult> }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** A YYYY-MM-DD date as the start or the end of that UTC day, or null when it is not a date. */
function dayBound(value: string | null, end: boolean): string | null {
  if (!value || !DATE_ONLY.test(value)) return null
  const time = Date.parse(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

const intParam = (value: string | null, fallback: number, min: number, max: number): number => {
  const n = Number(value)
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback
}

const rawRows = (docs: Array<Record<string, unknown>>) =>
  docs.map((doc) => ({
    id: doc.id as number | string | undefined,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
    detail: typeof doc.detail === 'string' ? doc.detail : null,
  }))

/**
 * GET /api/admin-consent-log - the consent decisions kept in the audit log,
 * for the Cookie consent admin page. Admins only.
 *
 * Query: page, limit (max 100), from, to (YYYY-MM-DD, UTC), category
 * (preferences|analytics|marketing) with state (granted|refused), and
 * format=csv for a download (capped at 10,000 rows, same filters).
 *
 * Returns { rows, page, limit, total, summary } where `summary` is always the
 * last 30 days, whatever the filters, built from at most 5,000 rows
 * (`summary.truncated` says when there were more). Rows carry no IP address or
 * user agent: they are not stored with consent entries.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!context.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const engine = context.engine as unknown as FindEngine
    const url = new URL(request.url)
    const params = url.searchParams

    const from = dayBound(params.get('from'), false)
    const to = dayBound(params.get('to'), true)
    const categoryParam = params.get('category')
    const category = isFilterCategory(categoryParam) ? categoryParam : null
    const state = params.get('state') === 'refused' ? 'refused' : 'granted'
    const wantsCsv = params.get('format') === 'csv'

    const clauses: Array<Record<string, unknown>> = [{ action: { equals: 'consent.update' } }]
    if (from) clauses.push({ createdAt: { greater_than_equal: from } })
    if (to) clauses.push({ createdAt: { less_than_equal: to } })
    if (category) {
      clauses.push({ detail: { [state === 'granted' ? 'contains' : 'not_like']: `"${category}":true` } })
    }
    const where = { and: clauses }

    if (wantsCsv) {
      const result = await engine.find({
        collection: 'audit-log',
        where,
        sort: '-createdAt',
        limit: EXPORT_MAX,
        depth: 0,
        user: context.user,
      })
      const records = filterRecords(parseAuditRows(rawRows(result.docs)), { category, state })
      return new NextResponse(recordsToCsv(records), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': 'attachment;filename=consent-log.csv',
          'Cache-Control': 'no-store',
        },
      })
    }

    const limit = intParam(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
    const page = intParam(params.get('page'), 1, 1, MAX_PAGE)

    const sinceIso = new Date(Date.now() - SUMMARY_DAYS * 86_400_000).toISOString()
    const [pageResult, summaryResult] = await Promise.all([
      engine.find({ collection: 'audit-log', where, sort: '-createdAt', limit, page, depth: 0, user: context.user }),
      engine.find({
        collection: 'audit-log',
        where: { and: [{ action: { equals: 'consent.update' } }, { createdAt: { greater_than_equal: sinceIso } }] },
        sort: '-createdAt',
        limit: SUMMARY_SCAN,
        depth: 0,
        user: context.user,
      }),
    ])

    const rows: ConsentLogRecord[] = parseAuditRows(rawRows(pageResult.docs))
    const summary = summarise(parseAuditRows(rawRows(summaryResult.docs)), SUMMARY_DAYS)

    return NextResponse.json(
      {
        rows,
        page,
        limit,
        total: pageResult.totalDocs ?? rows.length,
        summary: { ...summary, days: SUMMARY_DAYS, truncated: (summaryResult.totalDocs ?? 0) > SUMMARY_SCAN },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('admin-consent-log GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
