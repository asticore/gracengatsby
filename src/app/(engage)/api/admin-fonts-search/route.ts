import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { loadCatalog, searchCatalog, type CatalogSource } from '@/features/fonts/catalog'

/**
 * GET /api/admin-fonts-search?q=&source=all|google|other
 *
 * Searches the Fontsource catalog by family name. Read-only, and it installs
 * nothing - the admin picks a result and calls admin-fonts-install.
 */
export async function GET(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('settings:site-settings', 'update'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').slice(0, 80)
  const sourceParam = url.searchParams.get('source')
  const source: CatalogSource = sourceParam === 'google' || sourceParam === 'other' ? sourceParam : 'all'

  try {
    const fonts = await loadCatalog()
    const results = searchCatalog(fonts, query, source).map((font) => ({
      id: font.id,
      family: font.family,
      category: font.category ?? null,
      weights: font.weights,
      styles: font.styles,
      subsets: font.subsets,
      type: font.type,
    }))
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Font catalog search failed:', error)
    return NextResponse.json({ error: 'Could not reach the font catalog. Try again shortly.' }, { status: 502 })
  }
}
