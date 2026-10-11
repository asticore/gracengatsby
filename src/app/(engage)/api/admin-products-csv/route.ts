import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { CSV_MAX_BYTES } from '@/features/ecommerce/csv'
import { exportCatalogueCsv, runProductImport } from '@/features/ecommerce/server/csvImport'

export const dynamic = 'force-dynamic'

type CsvEngine = Parameters<typeof runProductImport>[0]

/** Admins only: the file can create, change and publish products. */
async function authorize() {
  const context = await getAdminContext()
  if (!context.user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  if (!context.isAdmin) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true as const, engine: context.engine as unknown as CsvEngine }
}

/** GET - every product as CSV (variations as extra rows with a Parent SKU). */
export async function GET(): Promise<Response> {
  const auth = await authorize()
  if (!auth.ok) return auth.response
  const csv = await exportCatalogueCsv(auth.engine)
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** POST multipart `file` - `?dryRun=1` previews (nothing is written) and returns the same report. */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize()
  if (!auth.ok) return auth.response
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  const form = await request.formData().catch((): null => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose a CSV file.' }, { status: 400 })
  if (file.size > CSV_MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 2 MB.' }, { status: 413 })
  const text = (await file.text()).replace(/^﻿/, '')
  const report = await runProductImport(auth.engine, text, { dryRun })
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
}
