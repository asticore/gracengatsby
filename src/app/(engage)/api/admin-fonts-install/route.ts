import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { putMediaObject } from '@/localapi/storage'
import { installFont } from '@/features/fonts/install'
import { sanitizeFontId } from '@/features/fonts/installed'

/**
 * POST /api/admin-fonts-install  { id, weights[], italic, local }
 *
 * Validates the font against the Fontsource catalog and returns the
 * InstalledFont to merge into the site settings form. Locally hosted fonts
 * are copied into R2 here. The site settings themselves are not saved.
 */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('settings:site-settings', 'update'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 })
  }

  const id = sanitizeFontId(body.id)
  if (!id) return NextResponse.json({ error: 'Unknown font id.' }, { status: 400 })

  try {
    const outcome = await installFont(
      id,
      { weights: body.weights, italic: body.italic === true, local: body.local === true },
      { store: putMediaObject },
    )
    if (outcome.ok === false) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    return NextResponse.json({ font: outcome.font })
  } catch (error) {
    console.error('Font install failed:', error)
    return NextResponse.json({ error: 'Could not install the font. Try again shortly.' }, { status: 502 })
  }
}
