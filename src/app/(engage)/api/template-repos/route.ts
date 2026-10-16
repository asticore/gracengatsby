import { NextResponse } from 'next/server'

import { listTemplates } from '@/features/templateRepos/fetch'
import { NO_STORE, templateRepoRefusal } from '@/features/templateRepos/routeAuth'
import { readTemplateRepoSettings } from '@/features/templateRepos/settings'

export const dynamic = 'force-dynamic'

/** GET /api/template-repos: templates from every enabled repository, plus one error per repository that failed. Admins and editors only. */
export async function GET(): Promise<Response> {
  try {
    const refusal = await templateRepoRefusal()
    if (refusal) return refusal
    const settings = await readTemplateRepoSettings()
    const result = await listTemplates(settings)
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE })
  } catch (error) {
    console.error('template-repos GET error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'The templates could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
