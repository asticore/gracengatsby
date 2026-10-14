import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { parseImportText } from '@/features/importContent/parse'
import { planItems } from '@/features/importContent/plan'
import { conversionTotals, loadExisting, runImport, type ImportEngine } from '@/features/importContent/run'
import { CONFLICT_MODES, IMPORT_MAX_BYTES, IMPORT_MAX_ITEMS, PREVIEW_ROW_LIMIT, type ConflictMode } from '@/features/importContent/types'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/admin-import-content (multipart form)
 * Fields: file (WXR .xml or CSV) or text (pasted CSV), action ("preview" or
 * "import"), conflicts (skip | overwrite-drafts-only | create-with-suffix),
 * keepPublished ("1" keeps published status, otherwise everything is a draft).
 * Preview writes nothing. Pages and posts need create permission for each type.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return json({ error: 'Please sign in again.' }, 401)
    const can = context.can as unknown as (resource: string, action: string) => boolean
    const allowed = { page: context.isAdmin || can('pages', 'create'), post: context.isAdmin || can('posts', 'create') }
    if (!allowed.page && !allowed.post) return json({ error: 'You do not have permission to create pages or posts.' }, 403)

    const form = await request.formData().catch((): null => null)
    if (!form) return json({ error: 'Send the file or the pasted text as a form.' }, 400)
    const file = form.get('file')
    const pasted = form.get('text')
    let text: string
    let fileName: string | undefined
    if (file && typeof file !== 'string') {
      if (file.size > IMPORT_MAX_BYTES) return json({ error: 'The file is larger than 6 MB. Split it into smaller files.' }, 413)
      text = await file.text()
      fileName = file.name
    } else if (typeof pasted === 'string' && pasted.trim()) {
      if (pasted.length > IMPORT_MAX_BYTES) return json({ error: 'The pasted text is larger than 6 MB. Split it into smaller parts.' }, 413)
      text = pasted
    } else {
      return json({ error: 'Choose a file or paste some CSV text first.' }, 400)
    }

    const requested = String(form.get('conflicts') ?? 'skip')
    const conflicts = (CONFLICT_MODES as string[]).includes(requested) ? (requested as ConflictMode) : 'skip'
    const keepPublished = ['1', 'true', 'on'].includes(String(form.get('keepPublished') ?? ''))
    const parsed = parseImportText(text, { fileName })
    if (parsed.items.length === 0) return json({ error: parsed.errors[0] ?? 'Nothing to import was found.', errors: parsed.errors, warnings: parsed.warnings }, 400)
    if (parsed.items.length > IMPORT_MAX_ITEMS) {
      return json({ error: `This file has ${parsed.items.length} items; one import handles at most ${IMPORT_MAX_ITEMS}. Split the file and import the parts one at a time.` }, 400)
    }

    const engine = context.engine as unknown as ImportEngine
    const options = { conflicts, keepPublished, allowed }
    if (form.get('action') === 'import') {
      const result = await runImport(engine, context.user, parsed.items, options)
      return json({ ...result, parseErrors: parsed.errors, parseWarnings: parsed.warnings })
    }

    const existing = await loadExisting(engine, parsed.items)
    const { rows, counts } = planItems(parsed.items, existing, options)
    return json({
      format: parsed.format,
      counts,
      skippedEntries: parsed.skipped,
      totals: conversionTotals(parsed.items),
      rows: rows.slice(0, PREVIEW_ROW_LIMIT),
      rowCount: rows.length,
      warnings: parsed.warnings,
      errors: parsed.errors,
    })
  } catch (error) {
    console.error('admin-import-content POST error:', error)
    return json({ error: 'Something went wrong while reading this file. Nothing was imported that failed to save.' }, 500)
  }
}
