import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { findRedirects } from '@/cms/db/collections/redirects'
import { resolveRedirect } from '@/features/redirects/resolve'
import { normalizePath } from '@/features/redirects/validate'

export async function GET(request: Request): Promise<Response> {
  const context = await getAdminContext()

  // Check permission to read redirects
  if (!(context.isAdmin || context.can('redirects', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const path = url.searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'path parameter is required' }, { status: 400 })
  }

  try {
    // Get all redirects to check for chains
    const allRedirects = await findRedirects({ limit: 10000 })

    // Resolve what the redirect resolver would do
    const result = await resolveRedirect(path)

    if (!result) {
      return NextResponse.json({
        match: false,
        path: normalizePath(path),
        message: 'No redirect found',
      })
    }

    // Build chain info: follow the redirect chain to see all hops
    const chain = [normalizePath(path)]
    let current = result.to
    let hopsRemaining = 10

    while (hopsRemaining > 0) {
      const nextNormalized = normalizePath(current)
      chain.push(nextNormalized)

      const next = allRedirects.find(
        (r) => normalizePath(r.fromPath) === nextNormalized && r.enabled !== false,
      )
      if (!next) break

      current = next.toPath
      hopsRemaining--
    }

    return NextResponse.json({
      match: true,
      requestPath: normalizePath(path),
      toPath: result.to,
      redirectType: result.status,
      chain,
      chainLength: chain.length - 1,
    })
  } catch (error) {
    console.error('Failed to test redirect:', error)
    return NextResponse.json({ error: 'Failed to test redirect' }, { status: 500 })
  }
}
