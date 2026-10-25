import { NextResponse } from 'next/server'
import { getDb } from '@/cms/db/connect'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { consumeGroupUse, getAccessRule, getGroup } from '@/cms/db/passwordGroups'
import { hitShared, peekShared } from '@/features/security/rateLimit'
import { groupFingerprint, groupIsUsable } from '@/features/visibility/access'
import { recordGroupEvent } from '@/features/visibility/groupAudit'
import { verifyPassword, signUnlockToken, cookieName, groupCookieName, GROUP_TOKEN_COLLECTION } from '@/features/visibility/password'

export const dynamic = 'force-dynamic'

const ALLOWED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])
const UNLOCK_TOKEN_TTL = 7 * 24 * 60 * 60 // 7 days
const BRUTE_FORCE_DELAY = 400 // ms
const GROUP_UNLOCKS_PER_MINUTE = 8
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


type UnlockDb = Parameters<typeof getGroup>[0]

/**
 * Unlock with a shared password group. One cookie per group unlocks every document that references it.
 * Fails closed at every step: switched off, rate limited, missing or expired group, wrong password and an
 * exhausted use cap all send the visitor back to the gate with no cookie. Each outcome is audited.
 */
async function unlockWithGroup(args: {
  request: Request
  db: UnlockDb
  groupId: number
  collection: string
  id: number
  password: string
  safeRedirect: string
  key: string
}): Promise<Response> {
  const { request, db, groupId, collection, id, password, safeRedirect, key } = args
  const back = (pw: 'wrong' | 'unavailable') => {
    const url = new URL(safeRedirect, request.url)
    url.searchParams.set('pw', pw)
    return NextResponse.redirect(url.toString(), { status: 303 })
  }
  const ref = `${collection}/${id}`
  const record = (action: Parameters<typeof recordGroupEvent>[0]['action'], detail: string) =>
    recordGroupEvent({ action, headers: request.headers, groupId, detail })

  const { readSecuritySettingsFromD1 } = await import('@/features/security/settings')
  if (!(await readSecuritySettingsFromD1()).passwordGroups.enabled) {
    await record('password-group.refused', `group passwords are switched off (${ref})`)
    return back('unavailable')
  }

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown'
  const decision = await hitShared(`group-unlock|${ip}|${groupId}`, GROUP_UNLOCKS_PER_MINUTE)
  if (decision.limited) {
    await record('password-group.refused', `rate limited (${ref})`)
    return back('wrong')
  }

  const group = await getGroup(db, groupId)
  if (!group || !groupIsUsable(group)) {
    await record('password-group.refused', `${group ? 'expired' : 'missing'} group (${ref})`)
    return back('wrong')
  }

  if (!(await verifyPassword(password, group.hash))) {
    await noteFailure(key)
    await record('password-group.unlock-failed', `wrong password for "${group.name}" (${ref})`)
    await new Promise((resolve) => setTimeout(resolve, BRUTE_FORCE_DELAY))
    return back('wrong')
  }

  if (!(await consumeGroupUse(db, group.id))) {
    await record('password-group.refused', `use limit reached for "${group.name}" (${ref})`)
    return back('wrong')
  }

  const untilExpiry = group.expiresAt ? Math.floor((Date.parse(group.expiresAt) - Date.now()) / 1000) : UNLOCK_TOKEN_TTL
  const ttlSeconds = Math.max(60, Math.min(UNLOCK_TOKEN_TTL, untilExpiry))
  const token = await signUnlockToken({ collection: GROUP_TOKEN_COLLECTION, id: group.id, ttlSeconds, fingerprint: groupFingerprint(group) })
  if (!token) {
    console.error('content-unlock: could not sign group unlock token (ENGAGE_SECRET missing?)')
    return back('unavailable')
  }

  await record('password-group.unlock', `unlocked via "${group.name}" (${ref})`)
  const response = NextResponse.redirect(new URL(safeRedirect, request.url), { status: 303 })
  response.cookies.set(groupCookieName(group.id), token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds,
  })
  return response
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

    // No per-document password: the document may use a shared password group instead
    if (!storedHash) {
      const rule = await getAccessRule(db, collection, id)
      if (rule && rule.groupId !== null) {
        return await unlockWithGroup({ request, db, groupId: rule.groupId, collection, id, password, safeRedirect, key })
      }
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
