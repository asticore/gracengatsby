import { NextResponse } from 'next/server'

import { clientKey, hit } from '@/features/security/rateLimit'
import { findSuggestions, normalizeSuggestQuery, SUGGEST_MIN_CHARS } from '@/features/search/suggest'

export const dynamic = 'force-dynamic'

const CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=30'

/** GET ?q= : up to 6 published results as {title, url, type, excerpt}. Public data only, no PII. */
export async function GET(request: Request): Promise<Response> {
  const decision = hit(`search-suggest:${clientKey(request)}`, 60)
  if (decision.limited) {
    return NextResponse.json({ results: [] }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds), 'Cache-Control': 'no-store' } })
  }
  const q = normalizeSuggestQuery(new URL(request.url).searchParams.get('q'))
  if (q.length < SUGGEST_MIN_CHARS) return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': CACHE } })
  try {
    const results = await findSuggestions(q)
    return NextResponse.json({ results }, { headers: { 'Cache-Control': CACHE } })
  } catch {
    return NextResponse.json({ results: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
