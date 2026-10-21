import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { sanitizeInstalledFonts } from '@/features/fonts/installed'
import { getEngine } from '@/lib/engine'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** GET /api/editor-fonts: the font families installed on the site (Site settings > Theme), for the editor's Family select. Admins only. */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    if (!context.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
    const engine = await getEngine()
    const settings = (await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)) as { theme?: { customFonts?: unknown } } | null
    const fonts = sanitizeInstalledFonts(settings?.theme?.customFonts).map((font) => ({ family: font.family }))
    return NextResponse.json({ fonts }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Could not load fonts.' }, { status: 500, headers: NO_STORE })
  }
}
