import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { runTranslationBulk } from '@/features/multilingual/translationActions'
import { isClearInactiveBody, runClearInactive } from '@/features/multilingual/clearInactive'
import { buildDocumentTranslations } from '@/features/multilingual/documentTranslations'
import { getMultilingualSettings } from '@/features/multilingual/settings'
import { findTranslations } from '@/features/multilingual/store'
import { translatableSource } from '@/features/multilingual/translatableFields'
import { loadAssignableUsers } from '@/features/multilingual/views/translationsData'

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
    const user = context.user ? { id: Number((context.user as { id?: unknown }).id) } : null

    if (isClearInactiveBody(body)) {
      const cleared = await runClearInactive({
        engine: context.engine as never,
        user: user
          ? { id: user.id, email: (context.user as { email?: string } | null)?.email ?? null }
          : null,
        isAdmin: context.isAdmin,
        canDelete: Boolean(context.can('translations', 'delete')),
        body,
        request,
      })
      return NextResponse.json(cleared.body, { status: cleared.status, headers: { 'Cache-Control': 'no-store' } })
    }

    const result = await runTranslationBulk({
      engine: context.engine as never,
      user,
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

/**
 * GET ?collection=<slug>&id=<document id>
 *
 * The Translate mode of the visual builder reads one document's translations
 * here: the source text of each translatable field and, per target language,
 * the stored value, status, assignees and whether this viewer may approve it.
 * The document is read as the signed-in user, so a page they cannot open
 * returns 404 rather than its text.
 */
export async function GET(request: Request): Promise<Response> {
  const noStore = { 'Cache-Control': 'no-store' }
  try {
    const context = await getAdminContext()
    const user = context.user ? { id: Number((context.user as { id?: unknown }).id) } : null
    if (!user || !Number.isInteger(user.id)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401, headers: noStore })
    if (!context.can('translations', 'read')) {
      return NextResponse.json({ error: 'You may not view translations.' }, { status: 403, headers: noStore })
    }

    const params = new URL(request.url).searchParams
    const collection = params.get('collection') ?? ''
    const documentId = params.get('id') ?? ''
    if (!translatableSource(collection) || !/^[A-Za-z0-9_-]{1,64}$/.test(documentId)) {
      return NextResponse.json({ error: 'Choose a translatable collection and document.' }, { status: 400, headers: noStore })
    }

    const engine = context.engine as never as Parameters<typeof getMultilingualSettings>[0] & {
      findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
    }
    const settings = await getMultilingualSettings(engine)
    if (!settings.enabled || settings.activeLocales.length < 2) {
      return NextResponse.json({ enabled: false, locales: [] }, { headers: noStore })
    }

    let doc: Record<string, unknown> | null = null
    try {
      doc = await engine.findByID({ collection, id: documentId, depth: 0, overrideAccess: false, user: context.user })
    } catch {
      doc = null
    }
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })

    const rows = await findTranslations(engine as never, { locales: settings.activeLocales, sourceKind: 'collection', sourceId: `${collection}:${documentId}` })
    const state = buildDocumentTranslations({
      collection,
      documentId,
      doc,
      settings,
      rows,
      viewer: { id: user.id, isAdmin: context.isAdmin },
    })
    if (!state) return NextResponse.json({ enabled: false, locales: [] }, { headers: noStore })
    const users = await loadAssignableUsers({ engine: engine as never, user: context.user })
    const title = String(doc.title ?? doc.question ?? `Document ${documentId}`)
    return NextResponse.json({ enabled: true, ...state, title, users: users.map((u) => ({ id: u.id, label: u.label })) }, { headers: noStore })
  } catch (error) {
    console.error('admin-translations GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
