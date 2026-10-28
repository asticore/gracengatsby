import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { runTranslationBulk } from '@/features/multilingual/translationActions'

export const dynamic = 'force-dynamic'

/**
 * Bulk actions on the Translations screen.
 *
 * POST { action: "approve" | "assign", items: [itemKey...], locales?: [code...], assignees?: [userId...] }
 *
 * Each item key is `<sourceKind>:<sourceId>` as the overview lists it. The writes
 * run as the signed-in user through the translations collection, so the approval
 * rule (reviewers, and admins unless bypass is off) is applied, not assumed.
 * Single-translation saves use the collection's own API at /api/translations.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    const body: unknown = await request.json().catch((): null => null)
    const result = await runTranslationBulk({
      engine: context.engine as never,
      user: context.user ? { id: Number((context.user as { id?: unknown }).id) } : null,
      isAdmin: context.isAdmin,
      canUpdate: Boolean(context.can('translations', 'update')),
      body,
    })
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-translations POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
