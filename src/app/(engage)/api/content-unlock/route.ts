import { NextResponse } from 'next/server'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { hitShared, peekShared } from '@/features/security/rateLimit'
import { verifyPassword, signUnlockToken, cookieName } from '@/features/visibility/password'

export const dynamic = 'force-dynamic'

const ALLOWED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])
const UNLOCK_TOKEN_TTL = 7 * 24 * 60 * 60 // 7 days
const BRUTE_FORCE_DELAY = 400 // ms
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 10 * 60 * 1000

// Counted in D1 (fixed window, shared by every isolate) with an in-memory fallback;
// see security/rateLimit.ts hitShared.
const WINDOW = { windowMs: FAILURE_WINDOW_MS }

function failureKey(request: Request, collection: string, id: number): string {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
  return `content-unlock:${ip}|${collection}|${id}`
}

async function isBlocked(key: string): Promise<boolean> {
  return (await peekShared(key, WINDOW)) >= MAX_FAILURES
}

async function noteFailure(key: string): Promise<void> {
  await hitShared(key, MAX_FAILURES, WINDOW)
}

/**
 * POST: Verify a password and set an unlock cookie.
 * Body (form data): {collection, id, password, redirect}
 *
 * On success: sets an httpOnly, secure, sameSite=lax cookie with a signed unlock token (7 days).
 *   Redirects to `redirect` if it's a safe same-site path, else '/'.
 * On failure: redirects back to `redirect` with ?pw=wrong added, after a small delay for brute-force friction.
 *
 * Redirect safety: must start with '/' and not contain '//' or backslash.
 */
export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData()
  const collection = formData.get('collection')
  const idParam = formData.get('id')
  const password = formData.get('password')
  const redirect = formData.get('redirect')

  // Validate inputs
  if (typeof collection !== 'string' || !ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json({ error: 'Invalid collection' }, { status: 400 })
  }
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }
  if (typeof redirect !== 'string') {
    return NextResponse.json({ error: 'Redirect required' }, { status: 400 })
  }

  // Validate redirect is safe
  const isSafeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\')
  const safeRedirect = isSafeRedirect ? redirect : '/'

  if (!process.env.ENGAGE_SECRET) {
    console.error('content-unlock: ENGAGE_SECRET is not set; unlock cookies cannot be signed')
    const unavailable = new URL(safeRedirect, request.url)
    unavailable.searchParams.set('pw', 'unavailable')
    return NextResponse.redirect(unavailable.toString(), { status: 303 })
  }

  const key = failureKey(request, collection, id)
  if (await isBlocked(key)) {
    const limited = new URL(safeRedirect, request.url)
    limited.searchParams.set('pw', 'wrong')
    return NextResponse.redirect(limited.toString(), { status: 303 })
  }

  try {
    const db = await getDb()
    const storedHash = await getPasswordHash(db, collection, id)

    // No password set for this document
    if (!storedHash) {
      return NextResponse.redirect(new URL(safeRedirect, request.url), { status: 303 })
    }

    // Verify password
    const isCorrect = await verifyPassword(password, storedHash)

    if (!isCorrect) {
      // Add brute-force friction
      await noteFailure(key)
      await new Promise((resolve) => setTimeout(resolve, BRUTE_FORCE_DELAY))

      // Build error redirect
      const errorUrl = new URL(safeRedirect, request.url)
      errorUrl.searchParams.set('pw', 'wrong')
      return NextResponse.redirect(errorUrl.toString(), { status: 303 })
    }

    // Password is correct, create unlock token
    const token = await signUnlockToken({
      collection,
      id,
      ttlSeconds: UNLOCK_TOKEN_TTL,
      fingerprint: storedHash.slice(-16),
    })

    if (!token) {
      // ENGAGE_SECRET not set, cannot create token
      console.error('content-unlock: could not sign unlock token (ENGAGE_SECRET missing?)')
      const unavailable = new URL(safeRedirect, request.url)
      unavailable.searchParams.set('pw', 'unavailable')
      return NextResponse.redirect(unavailable.toString(), { status: 303 })
    }

    // Create response with redirect
    const response = NextResponse.redirect(new URL(safeRedirect, request.url), { status: 303 })

    // Set the unlock cookie
    response.cookies.set(cookieName(collection, id), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: UNLOCK_TOKEN_TTL,
    })

    return response
  } catch (error) {
    console.error('content-unlock error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
