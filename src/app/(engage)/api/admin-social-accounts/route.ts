import { NextResponse } from 'next/server'

import { getEngine } from '@/lib/engine'
import { fetchPosts } from '@/features/socialFeeds/adapters'
import { publicAccountList, readSocialAccounts } from '@/features/socialFeeds/service'

export const dynamic = 'force-dynamic'

/**
 * Admin only.
 * GET  -> { options: [{ value, label }] }: connected accounts for the editor picker. Id and label only, never a token.
 * POST { id } -> { ok, count } or { ok: false, error }: fetches a few posts to test the connection. The error text is
 *                redacted by the adapter and never contains the token.
 */

const noStore = { 'Cache-Control': 'no-store' }

async function admin(request: Request): Promise<{ engine: Awaited<ReturnType<typeof getEngine>> } | null> {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: request.headers })
  if (!user || !(user as { roles?: string[] }).roles?.includes('admin')) return null
  return { engine }
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await admin(request)
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const accounts = await readSocialAccounts(ctx.engine as never)
  return NextResponse.json({ options: publicAccountList(accounts) }, { headers: noStore })
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await admin(request)
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const body = (await request.json().catch((): null => null)) as { id?: unknown } | null
  const accounts = await readSocialAccounts(ctx.engine as never)
  const account = accounts.find((a) => a.id === body?.id)
  if (!account) return NextResponse.json({ ok: false, error: 'Account not found. Save the Integrations page first.' }, { status: 404, headers: noStore })
  try {
    const posts = await fetchPosts(account, 3)
    return NextResponse.json({ ok: true, count: posts.length }, { headers: noStore })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Test failed' }, { headers: noStore })
  }
}
