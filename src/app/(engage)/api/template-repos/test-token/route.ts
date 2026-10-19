import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { testRepoAccess } from '@/features/templateRepos/fetch'
import { activeRepos } from '@/features/templateRepos/manifest'
import { NO_STORE } from '@/features/templateRepos/routeAuth'
import { readTemplateRepoSettings } from '@/features/templateRepos/settings'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: NO_STORE })

/**
 * POST /api/template-repos/test-token: checks the saved access token against each active repository with a
 * HEAD request. Answers with a message per repository. The token is never returned or logged. Admins only.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return json({ ok: false, error: 'Unauthorized' }, 401)
    if (!context.isAdmin) return json({ ok: false, error: 'Forbidden' }, 403)
    if (hit(`template-repos-test-token:${clientKey(request)}`, 10).limited) {
      return json({ ok: false, error: 'Too many requests. Wait a minute and try again.' }, 429)
    }
    const settings = await readTemplateRepoSettings()
    const repos = activeRepos(settings)
    if (repos.length === 0) return json({ ok: false, error: 'Save at least one valid, enabled repository first.' }, 400)
    const results = await Promise.all(
      repos.map(async (repo) => {
        const checked = await testRepoAccess(repo, settings.token)
        return { repoIndex: repo.index, repoLabel: repo.label, ok: checked.ok, message: checked.ok ? checked.value : checked.error }
      }),
    )
    return json({ ok: true, hasToken: Boolean(settings.token), results })
  } catch (error) {
    console.error('template-repos test-token error:', error instanceof Error ? error.name : 'unknown')
    return json({ ok: false, error: 'The check could not be run.' }, 500)
  }
}
