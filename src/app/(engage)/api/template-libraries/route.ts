import { libraryJson, libraryUseAccess, storeEngine } from '@/features/templateLibraries/server'
import { listLibraries } from '@/features/templateLibraries/list'

export const dynamic = 'force-dynamic'

/** GET /api/template-libraries[?fresh=1]: every enabled library and its items. Anyone who can use templates. */
export async function GET(request: Request): Promise<Response> {
  try {
    const access = await libraryUseAccess()
    if (!access.ok) return access.response
    const fresh = new URL(request.url).searchParams.get('fresh') === '1'
    const listing = await listLibraries(storeEngine(access.context), { fresh })
    return libraryJson({ ok: true, ...listing, canManage: access.context.isAdmin === true })
  } catch (error) {
    console.error('template-libraries GET error:', error instanceof Error ? error.name : 'unknown')
    return libraryJson({ ok: false, error: 'The template libraries could not be loaded.' }, 500)
  }
}
