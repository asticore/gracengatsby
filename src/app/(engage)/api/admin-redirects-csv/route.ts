import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { findRedirects, createRedirect } from '@/cms/db/collections/redirects'
import { toCsv, parseCsv } from '@/features/redirects/csv'

export async function GET(): Promise<Response> {
  const context = await getAdminContext()

  // Check permission to read redirects
  if (!(context.isAdmin || context.can('redirects', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const redirects = await findRedirects({ limit: 10000 })

    const csvData = toCsv(
      redirects.map((r) => ({
        fromPath: r.fromPath,
        toPath: r.toPath,
        redirectType: r.redirectType,
        enabled: r.enabled !== false,
        note: r.note || undefined,
      })),
    )

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment;filename=redirects.csv',
      },
    })
  } catch (error) {
    console.error('Failed to export redirects CSV:', error)
    return NextResponse.json({ error: 'Failed to export CSV' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()

  // Check permission to create redirects
  if (!(context.isAdmin || context.can('redirects', 'create'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const csvText = await file.text()

    // Get existing redirects for duplicate checking
    const existing = await findRedirects({ limit: 10000 })

    // Parse CSV
    const parsed = parseCsv(csvText, existing.map((r) => ({ ...r, enabled: r.enabled !== false })))

    // Count rows that will be skipped (existing fromPath)
    const normalizedExisting = new Map(
      existing.map((r) => {
        const normalized = r.fromPath.trim().startsWith('/') ? r.fromPath.trim() : '/' + r.fromPath.trim()
        return [normalized, r]
      }),
    )

    const toCreate = []
    const skipped = []

    for (const row of parsed.rows) {
      const normalized = row.fromPath.trim().startsWith('/') ? row.fromPath.trim() : '/' + row.fromPath.trim()
      if (normalizedExisting.has(normalized)) {
        skipped.push(row)
      } else {
        toCreate.push(row)
      }
    }

    // If dry-run, just return the preview
    if (dryRun) {
      return NextResponse.json({
        success: true,
        isDryRun: true,
        totalRows: parsed.rows.length,
        validRows: toCreate.length,
        skippedRows: skipped.length,
        errorRows: parsed.errors.length,
        errors: parsed.errors,
        preview: toCreate.slice(0, 5).map((r) => ({
          fromPath: r.fromPath,
          toPath: r.toPath,
          redirectType: r.redirectType,
        })),
      })
    }

    // Actually create the redirects
    const created = []
    for (const row of toCreate) {
      try {
        const result = await createRedirect({
          fromPath: row.fromPath,
          toPath: row.toPath,
          redirectType: row.redirectType as '301' | '302' | '307' | '308',
          enabled: row.enabled !== false,
          note: row.note || undefined,
        })
        created.push(result)
      } catch (error) {
        console.error('Failed to create redirect:', row, error)
      }
    }

    return NextResponse.json({
      success: true,
      isDryRun: false,
      totalRows: parsed.rows.length,
      createdRows: created.length,
      skippedRows: skipped.length,
      errorRows: parsed.errors.length,
      errors: parsed.errors,
    })
  } catch (error) {
    console.error('Failed to import redirects CSV:', error)
    return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 })
  }
}
