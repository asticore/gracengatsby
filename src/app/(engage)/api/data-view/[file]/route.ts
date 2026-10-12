import { canReadPrivateViews } from '@/features/dataViews/access'
import { toCsvBody, toJsonBody } from '@/features/dataViews/embed'
import { loadDataView } from '@/features/dataViews/load'

export const dynamic = 'force-dynamic'

const notFound = (): Response => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

/**
 * GET /api/data-view/<id-or-slug>.csv or .json - the data behind a table or chart.
 *
 * Public only when the view is marked public. Otherwise it answers 404 (never 403, so a private view
 * cannot be told apart from a missing one) unless the caller is a signed-in person who may read Tables
 * and charts. The rows come from the same resolver as the page, so they carry the same rules: only
 * published documents that are not members-only or password protected, and only fields the view allows.
 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await context.params
  const match = /^(.{1,80})\.(csv|json)$/.exec(file)
  if (!match) return notFound()
  const [, ref, format] = match as unknown as [string, string, 'csv' | 'json']

  let result = await loadDataView(ref, { requirePublic: true })
  let isPublic = true
  if (result.status === 'private') {
    if (!(await canReadPrivateViews())) return notFound()
    result = await loadDataView(ref, { requirePublic: false })
    isPublic = false
  }
  if (result.status === 'error') return new Response('Could not load this data.', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
  if (result.status !== 'ok') return notFound()

  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'cache-control': isPublic ? 'public, max-age=60' : 'private, no-store',
  }
  if (isPublic) headers['access-control-allow-origin'] = '*'

  if (format === 'csv') {
    return new Response(toCsvBody(result.model), { status: 200, headers: { ...headers, 'content-type': 'text/csv; charset=utf-8' } })
  }
  return new Response(JSON.stringify(toJsonBody(result.model)), { status: 200, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } })
}

/** Lets a page on another site read a public view from the browser. */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' } })
}
