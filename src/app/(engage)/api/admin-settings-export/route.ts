import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { parseExportOptions, renderExport } from '@/features/settingsTransfer/export'
import { ExportFormatError } from '@/features/settingsTransfer/format'

/**
 * Admin-only. Body: export options JSON (see `ExportOptions`). Responds with the
 * export as a file download. Secrets are included only when asked for, and then
 * the whole file is encrypted with the password given.
 */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!context.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Send the export options as JSON.' }, { status: 400 })
  }

  try {
    const options = parseExportOptions(raw)
    const { body, filename } = await renderExport(context.engine, options)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof ExportFormatError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Settings export failed:', error)
    return NextResponse.json({ error: 'The export could not be created.' }, { status: 500 })
  }
}
