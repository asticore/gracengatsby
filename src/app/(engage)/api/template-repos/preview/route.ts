import { NextResponse } from 'next/server'

import { findActiveRepo, findManifestEntry, isValidSlug, loadPreviewImage } from '@/features/templateRepos/fetch'
import { NO_STORE, templateRepoRefusal } from '@/features/templateRepos/routeAuth'
import { readTemplateRepoSettings } from '@/features/templateRepos/settings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/template-repos/preview?repo=<number>&slug=<name>: the template's
 * preview picture, passed through from GitHub. Only png, jpeg and webp up to
 * 2 MB are ever returned. Admins and editors only.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const refusal = await templateRepoRefusal()
    if (refusal) return refusal
    const params = new URL(request.url).searchParams
    const slug = params.get('slug')
    if (!isValidSlug(slug)) return NextResponse.json({ ok: false, error: 'That template name is not valid.' }, { status: 400, headers: NO_STORE })

    const settings = await readTemplateRepoSettings()
    const repo = findActiveRepo(settings, params.get('repo'))
    if (!repo) return NextResponse.json({ ok: false, error: 'That repository is not available.' }, { status: 404, headers: NO_STORE })

    const entry = await findManifestEntry(repo, slug, settings.token)
    if (!entry.ok) return NextResponse.json({ ok: false, error: entry.error }, { status: 502, headers: NO_STORE })
    const image = await loadPreviewImage(repo, entry.value, settings.token)
    if (!image.ok) return NextResponse.json({ ok: false, error: image.error }, { status: 502, headers: NO_STORE })

    return new Response(image.value.bytes as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': image.value.contentType,
        'Content-Length': String(image.value.bytes.byteLength),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    console.error('template-repos preview GET error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'The preview could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
