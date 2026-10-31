import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { readUploadPolicy, type MediaEngine } from '@/features/media/store'
import { insertTemplateAssets, sha256Hex, type UploadFileLike } from '@/features/templateRepos/insertAssets'
import { NO_STORE } from '@/features/templateRepos/routeAuth'
import type { TemplateFile, TemplateRepoConfig } from '@/features/templateRepos/types'

import { readLibraryState, writeLibraryState, type ImportRecord, type LibraryStoreEngine } from './store'

/**
 * Server-only helpers behind the template library routes. Every route calls one of the access
 * checks first. getAdminContext re-reads the signed-in user (and whoever is being impersonated) on
 * each request, so nothing is trusted from the browser. The browser never sends a URL to fetch: a
 * library is named by its saved id and an item by its manifest slug.
 */

export type AdminContext = Awaited<ReturnType<typeof getAdminContext>>

type Refusal = { ok: false; response: Response; context?: undefined }
type Allowed = { ok: true; context: AdminContext; response?: undefined }

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: NO_STORE })

const canDo = (context: AdminContext, resource: string, action: string): boolean =>
  (context.can as unknown as (resource: string, action: string) => boolean)(resource, action)

/** Browsing and inserting library items: administrators, and anyone who can create or update pages. */
export async function libraryUseAccess(): Promise<Allowed | Refusal> {
  const context = await getAdminContext()
  if (!context.user) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, 401) }
  if (context.isAdmin || canDo(context, 'pages', 'create') || canDo(context, 'pages', 'update')) return { ok: true, context }
  return { ok: false, response: json({ ok: false, error: 'You do not have permission to use templates.' }, 403) }
}

/** Creating a draft page from a library item. */
export async function libraryPageAccess(): Promise<Allowed | Refusal> {
  const context = await getAdminContext()
  if (!context.user) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, 401) }
  if (context.isAdmin || canDo(context, 'pages', 'create')) return { ok: true, context }
  return { ok: false, response: json({ ok: false, error: 'You do not have permission to create pages.' }, 403) }
}

/** Adding, removing and switching libraries: administrators only, as for the other settings. */
export async function librarySettingsAccess(): Promise<Allowed | Refusal> {
  const context = await getAdminContext()
  if (!context.user) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, 401) }
  if (context.isAdmin) return { ok: true, context }
  return { ok: false, response: json({ ok: false, error: 'Only administrators can change template libraries.' }, 403) }
}

export { json as libraryJson }

/** The engine as the library store sees it. */
export function storeEngine(context: AdminContext): LibraryStoreEngine {
  return context.engine as unknown as LibraryStoreEngine
}

/**
 * Saves the pictures of a library item to the media gallery. A picture whose bytes match one already
 * saved (same SHA-256) is reused, not saved again, as long as that media item still exists. Nothing
 * is saved unless every picture passed its checks (see insertTemplateAssets).
 */
export async function importItemPictures(
  context: AdminContext,
  config: TemplateRepoConfig,
  template: TemplateFile,
  sourceUrl: string,
  allowRawHtml: boolean,
): Promise<{ ok: true; tree: unknown[]; saved: number; reused: number; error?: undefined } | { ok: false; error: string; tree?: undefined; saved?: undefined; reused?: undefined }> {
  const engine = storeEngine(context)
  const mediaEngine = context.engine as unknown as MediaEngine
  const policy = await readUploadPolicy(mediaEngine)
  const state = await readLibraryState(engine)
  const records: ImportRecord[] = [...state.imports]
  const fresh: ImportRecord[] = []
  let reused = 0

  const inserted = await insertTemplateAssets(
    { repo: config, token: null, template, allowRawHtml },
    {
      maxBytes: policy.maxBytes,
      createMedia: async (file: UploadFileLike, alt: string) => {
        const sha256 = await sha256Hex(file.data)
        const known = records.find((record) => record.sha256 === sha256)
        if (known) {
          const existing = (await engine.findByID({ collection: 'media', id: known.mediaId, depth: 0, overrideAccess: true }).catch((): null => null)) as
            | { url?: unknown }
            | null
          if (existing) {
            reused += 1
            return { id: known.mediaId, url: typeof existing.url === 'string' ? existing.url : '' }
          }
        }
        const doc = await engine.create({
          collection: 'media',
          data: { alt, caption: '', folder: '', source: 'upload' },
          file,
          overrideAccess: true,
        })
        const record: ImportRecord = { sha256, mediaId: Number(doc.id), sourceUrl }
        records.push(record)
        fresh.push(record)
        return { id: Number(doc.id), url: typeof doc.url === 'string' ? doc.url : '' }
      },
    },
  )
  if (!inserted.ok) return { ok: false, error: inserted.error }

  if (fresh.length > 0) {
    // Save the new records. The list of libraries is read again so a concurrent settings change is kept.
    const current = await readLibraryState(engine)
    await writeLibraryState(
      engine,
      current.rows.map((row) => ({ id: row.id, label: row.label, url: row.url, enabled: row.enabled })),
      [...current.imports, ...fresh],
      context.user,
    )
  }
  return { ok: true, tree: inserted.value.tree, saved: fresh.length, reused }
}

/** A URL slug from a title: lower case words joined by dashes. Falls back to a short unique word. */
export function slugFromTitle(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || `page-${Date.now().toString(36)}`
}

/** `slug`, `slug-2`, ... up to 20 tries, so a new page never clashes with an existing one. */
export async function uniquePageSlug(engine: LibraryStoreEngine, base: string): Promise<string> {
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 60)}-${n}`
    const { docs } = await engine.find({
      collection: 'pages',
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    if (docs.length === 0) return candidate
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`
}
