import { NextResponse } from 'next/server'

import { adminCan } from '@/features/dataViews/access'
import { normalizeDataView } from '@/features/dataViews/config'
import { findViewDoc, modelFor } from '@/features/dataViews/load'
import { LIMITS } from '@/features/dataViews/types'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }
const MAX_BODY = LIMITS.maxCsvChars + 600_000

/**
 * Live preview for the editor and the visual editor canvas.
 *
 *   GET  ?id=<n>  the saved view's resolved data (needs read on Tables and charts).
 *   POST {kind, source, data, grid, csvText, columns, display, chart}  the unsaved settings, resolved
 *        with the same code the live site uses (needs create or update).
 *
 * Nothing is saved. The settings are normalised first, and the resolver reads only fields in the
 * allow-list, so a crafted body cannot reach anything a saved view could not.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    if (!(await adminCan('read'))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers })
    const id = new URL(request.url).searchParams.get('id') ?? ''
    if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400, headers })
    const doc = await findViewDoc(id)
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404, headers })
    return NextResponse.json({ model: await modelFor(normalizeDataView(doc)) }, { headers })
  } catch (error) {
    console.error('admin-data-view-preview GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!((await adminCan('update')) || (await adminCan('create')))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers })
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413, headers })
    const text = await request.text()
    if (text.length > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413, headers })
    let body: Record<string, unknown>
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'bad json' }, { status: 400, headers })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad body' }, { status: 400, headers })
    const def = normalizeDataView({
      id: 0,
      title: typeof body.title === 'string' ? body.title : 'Preview',
      kind: body.kind,
      source: body.source,
      config: { data: body.data, grid: body.grid, csvText: body.csvText, columns: body.columns, display: body.display, chart: body.chart },
    })
    return NextResponse.json({ model: await modelFor(def) }, { headers })
  } catch (error) {
    console.error('admin-data-view-preview POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
