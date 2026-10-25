import { NextResponse } from 'next/server'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { verifyPassword, signUnlockToken, cookieName } from '@/features/visibility/password'
import { getItemGroupId, groupMembers } from '@/cms/db/passwordGroups'

export const dynamic = 'force-dynamic'

const ALLOWED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])
const UNLOCK_TOKEN_TTL = 7 * 24 * 60 * 60 // 7 days
const BRUTE_FORCE_DELAY = 400 // ms
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 10 * 60 * 1000
const MAX_TRACKED = 5000

// Best-effort, per-isolate (see security/rateLimit.ts for the caveat).
const failures = new Map<string, { count: number; resetAt: number }>()

function failureKey(request: Request, collection: string, id: number): string {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
  return `${ip}|${collection}|${id}`
}

function isBlocked(key: string, now: number): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (entry.resetAt <= now) {
    failures.delete(key)
    return false
  }
  return entry.count >= MAX_FAILURES
}

function noteFailure(key: string, now: number): void {
  const entry = failures.get(key)
  if (entry && entry.resetAt > now) {
    entry.count += 1
    return
  }
  if (failures.size >= MAX_TRACKED) {
    const oldest = failures.keys().next().value
    if (oldest !== undefined) failures.delete(oldest)
  }
  failures.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS })
}


/** The shared group an item belongs to, or null. Any lookup failure reads as no group. */
async function readItemGroupId(db: Awaited<ReturnType<typeof getDb>>, collection: string, id: number): Promise<number | null> {
  try {
    return await getItemGroupId(db, collection, id)
  } catch {
    return null
  }
}

async function readGroupMembers(
  db: Awaited<ReturnType<typeof getDb>>,
  groupId: number,
): Promise<{ collection: string; docId: number }[]> {
  try {
    return await groupMembers(db, groupId)
  } catch {
    return []
  }
}

/** Shared account rate limit on group-password attempts. Fails closed when the limiter is unavailable. */
async function allowGroupAttempt(request: Request): Promise<boolean> {
  try {
    const { getEngine } = await import('@/lib/engine')
    const { guardAttempt } = await import('@/features/accounts/rateLimit')
    const address = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
    const decision = await guardAttempt(await getEngine(), 'password-group', address)
    return decision.allowed
  } catch {
    return false
  }
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
  if (isBlocked(key, Date.now())) {
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

    // A shared group password is guessed across every item it unlocks, so its attempts
    // get the account rate-limit budget too. Lookup failure here means no group, and the
    // item's effective hash is then unusable if its group has gone, so it stays locked.
    const groupId = await readItemGroupId(db, collection, id)
    if (groupId !== null) {
      const allowed = await allowGroupAttempt(request)
      if (!allowed) {
        const limited = new URL(safeRedirect, request.url)
        limited.searchParams.set('pw', 'wrong')
        return NextResponse.redirect(limited.toString(), { status: 303 })
      }
    }

    // Verify password
    const isCorrect = await verifyPassword(password, storedHash)

    if (!isCorrect) {
      // Add brute-force friction
      noteFailure(key, Date.now())
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

    // A group password opens every item in the group: one cookie each, same style and fingerprint.
    if (groupId !== null) {
      const members = await readGroupMembers(db, groupId)
      for (const member of members) {
        if (member.collection === collection && member.docId === id) continue
        const memberToken = await signUnlockToken({
          collection: member.collection,
          id: member.docId,
          ttlSeconds: UNLOCK_TOKEN_TTL,
          fingerprint: storedHash.slice(-16),
        })
        if (!memberToken) continue
        response.cookies.set(cookieName(member.collection, member.docId), memberToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: UNLOCK_TOKEN_TTL,
        })
      }
    }

    return response
  } catch (error) {
    console.error('content-unlock error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
