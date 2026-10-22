import { cookies } from 'next/headers'

import { buildFrameDocument, embedFrameHeaders, findEmbedSnippet, safePagePath } from '@/lib/embedCode'
import { getEngine } from '@/lib/engine'
import { getPasswordGateState } from '@/features/visibility/gate'
import { findPageByPath, getHomepage } from '@/utilities/pagePaths'

export const dynamic = 'force-dynamic'

/**
 * GET /embed-frame/<hash>?path=/page/path
 *
 * Serves the document that holds one "Embed code" snippet, for the sandboxed iframe on that page. The snippet is
 * never in the URL: the page path says WHICH published document to read, the hash says which element in it. Only
 * published, non-trashed, non-password-locked documents are read (pages, and posts at /blog/<slug>); anything
 * else answers the same 404, so the route reveals nothing. See src/lib/embedCode.ts for the design.
 */
const notFound = (): Response => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })

type Located = { collection: 'pages' | 'posts'; doc: Record<string, unknown> & { id: number } }

async function locate(path: string): Promise<Located | null> {
  if (path === '/') {
    const home = await getHomepage()
    return home ? { collection: 'pages', doc: home as never } : null
  }
  const post = /^\/blog\/([^/]+)\/?$/.exec(path)
  if (post) {
    const engine = await getEngine()
    const { docs } = await engine.find({
      collection: 'posts',
      where: { and: [{ slug: { equals: decodeURIComponent(post[1]) } }, { _status: { equals: 'published' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = docs[0] as unknown as (Located['doc'] & { trashedAt?: string | null }) | undefined
    return doc && !doc.trashedAt ? { collection: 'posts', doc } : null
  }
  const found = await findPageByPath(path.split('/').filter(Boolean))
  const page = found?.page as unknown as (Located['doc'] & { trashedAt?: string | null }) | undefined
  return page && !page.trashedAt ? { collection: 'pages', doc: page } : null
}

export async function GET(request: Request, ctx: { params: Promise<{ hash: string }> }): Promise<Response> {
  const { hash } = await ctx.params
  if (!/^[0-9a-f]{32}$/.test(hash)) return notFound()
  const path = safePagePath(new URL(request.url).searchParams.get('path'))
  if (!path) return notFound()
  try {
    const located = await locate(path)
    if (!located) return notFound()
    const gate = await getPasswordGateState({ collection: located.collection, id: located.doc.id, cookies: await cookies() })
    if (gate === 'locked') return notFound()
    const snippet = await findEmbedSnippet(located.doc, hash)
    if (!snippet) return notFound()
    return new Response(buildFrameDocument(snippet.snippet, hash, snippet.title), { status: 200, headers: embedFrameHeaders() })
  } catch {
    return notFound()
  }
}
