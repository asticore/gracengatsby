import { NextResponse } from 'next/server'

import { findActiveRepo, findManifestEntry, isValidSlug, loadTemplateFile } from '@/features/templateRepos/fetch'
import { NO_STORE, templateRepoRefusal } from '@/features/templateRepos/routeAuth'
import { readTemplateRepoSettings } from '@/features/templateRepos/settings'

export const dynamic = 'force-dynamic'

/** GET /api/template-repos/template?repo=<number>&slug=<name>: one validated template. Admins and editors only. */
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
    const template = await loadTemplateFile(repo, entry.value, settings.token)
    if (!template.ok) return NextResponse.json({ ok: false, error: template.error }, { status: 502, headers: NO_STORE })

    return NextResponse.json(
      {
        ok: true,
        repoIndex: repo.index,
        slug: entry.value.slug,
        title: entry.value.title,
        kind: template.value.kind,
        template: template.value,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('template-repos template GET error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'The template could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
