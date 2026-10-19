import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { findActiveRepo, findManifestEntry, isValidSlug, loadTemplateFile } from '@/features/templateRepos/fetch'
import { insertTemplateAssets } from '@/features/templateRepos/insertAssets'
import { NO_STORE } from '@/features/templateRepos/routeAuth'
import { readTemplateRepoSettings } from '@/features/templateRepos/settings'
import { readUploadPolicy, type MediaEngine } from '@/features/media/store'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_MINUTE = 10

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: NO_STORE })

/**
 * POST /api/template-repos/assets   { repo: number, slug: string, allowRawHtml?: boolean }
 *
 * Adds a repository template's pictures to the media library and returns the template tree pointed at
 * them. The template is loaded again here from the repository (the browser sends no tree and no URL).
 * Administrators, and people allowed to update pages, only.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return json({ ok: false, error: 'Unauthorized' }, 401)
    const can = context.can as unknown as (resource: string, action: string) => boolean
    if (!(context.isAdmin || can('pages', 'update'))) return json({ ok: false, error: 'Forbidden' }, 403)

    if (hit(`template-repos-assets:${clientKey(request)}`, RATE_LIMIT_PER_MINUTE).limited) {
      return json({ ok: false, error: 'Too many requests. Wait a minute and try again.' }, 429)
    }

    const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
    const slug = body?.slug
    if (!isValidSlug(slug)) return json({ ok: false, error: 'That template name is not valid.' }, 400)

    const settings = await readTemplateRepoSettings()
    const repo = findActiveRepo(settings, typeof body?.repo === 'number' ? String(body.repo) : body?.repo)
    if (!repo) return json({ ok: false, error: 'That repository is not available.' }, 404)

    const entry = await findManifestEntry(repo, slug, settings.token)
    if (!entry.ok) return json({ ok: false, error: entry.error }, 502)
    const template = await loadTemplateFile(repo, entry.value, settings.token)
    if (!template.ok) return json({ ok: false, error: template.error }, 502)

    const engine = context.engine as unknown as MediaEngine
    const policy = await readUploadPolicy(engine)
    const inserted = await insertTemplateAssets(
      { repo, token: settings.token, template: template.value, allowRawHtml: body?.allowRawHtml === true },
      {
        maxBytes: policy.maxBytes,
        createMedia: async (file, alt) => {
          const doc = await engine.create({
            collection: 'media',
            data: { alt, caption: '', folder: '', source: 'upload' },
            file,
            overrideAccess: true,
          })
          return { id: Number(doc.id), url: typeof doc.url === 'string' ? doc.url : '' }
        },
      },
    )
    if (!inserted.ok) return json({ ok: false, error: inserted.error }, 422)
    return json({ ok: true, tree: inserted.value.tree, idMap: inserted.value.idMap, saved: inserted.value.saved })
  } catch (error) {
    console.error('template-repos assets POST error:', error instanceof Error ? error.name : 'unknown')
    return json({ ok: false, error: 'The pictures could not be added.' }, 500)
  }
}
