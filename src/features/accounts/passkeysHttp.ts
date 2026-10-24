import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  PASSKEY_CHALLENGE_COOKIE,
  listPasskeys,
  loginOptions,
  loginWithPasskey,
  registerPasskey,
  registrationOptions,
  removePasskey,
  renamePasskey,
} from '@/features/passkeys'
import { guardAttempt, tooManyAttempts } from './rateLimit'
import { passkeyDepsFor } from './passkeysWiring'
import { accountContext, requestAddress, requestClient, setSessionCookie } from './session'
import { safeLandingPath } from '@/features/passwordless'

/**
 * JSON handlers for passkeys. The identity of a registration, a removal or a
 * listing always comes from the session cookie (accountContext), never from the
 * body. A sign-in names no account: the credential id in the answer finds it.
 * Every route refuses cross-site requests and answers no-store.
 */

const noStore = { 'Cache-Control': 'no-store' }
const json = (body: Record<string, unknown>, status = 200): Response => NextResponse.json(body, { status, headers: noStore })

const sameSite = async (request: Request): Promise<boolean> => {
  const origin = (await headers()).get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const data = (await request.json()) as unknown
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const setChallengeCookie = async (value: string): Promise<void> => {
  const jar = await cookies()
  jar.set(PASSKEY_CHALLENGE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/passkeys',
    maxAge: 300,
  })
}

const clearChallengeCookie = async (): Promise<void> => {
  const jar = await cookies()
  jar.delete({ name: PASSKEY_CHALLENGE_COOKIE, path: '/api/passkeys' })
}

const challengeFromRequest = async (): Promise<string | null> => (await cookies()).get(PASSKEY_CHALLENGE_COOKIE)?.value ?? null

const UNAVAILABLE = 'Passkeys are not available on this site.'
const SIGNED_OUT = 'Sign in first.'

/** POST /api/passkeys/register-options: creation options for the signed-in person. */
export async function registerOptionsResponse(request: Request): Promise<Response> {
  if (!(await sameSite(request))) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.flags.accounts || !context.user) return json({ ok: false, message: SIGNED_OUT }, 401)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const outcome = await registrationOptions(deps, context.user as never)
  if (!outcome.ok) return json({ ok: false, message: outcome.message }, outcome.status)
  await setChallengeCookie(outcome.cookie ?? '')
  return json({ ok: true, options: outcome.options })
}

/** POST /api/passkeys/register-verify: checks the new credential. Body carries the answer and a password or code. */
export async function registerVerifyResponse(request: Request): Promise<Response> {
  if (!(await sameSite(request))) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.flags.accounts || !context.user) return json({ ok: false, message: SIGNED_OUT }, 401)
  const userId = Number((context.user as { id: number }).id)
  const limited = await guardAttempt(context.engine, 'passkey', `user:${userId}`)
  if (!limited.allowed) return json({ ok: false, message: tooManyAttempts(limited.retryAfterSeconds ?? 60) }, 429)
  const body = await readJson(request)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const outcome = await registerPasskey(deps, context.user as never, body as never, await challengeFromRequest())
  await clearChallengeCookie()
  if (!outcome.ok) return json({ ok: false, message: outcome.message }, outcome.status)
  return json({ ok: true, id: outcome.id, passkeys: await listPasskeys(deps, Number((context.user as { id: number }).id)) })
}

/** POST /api/passkeys/login-options: discoverable sign-in options. Refused when passkeys are off. */
export async function loginOptionsResponse(request: Request): Promise<Response> {
  if (!(await sameSite(request))) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.flags.accounts) return json({ ok: false, message: UNAVAILABLE }, 404)
  const byIp = await guardAttempt(context.engine, 'passkey', `ip:${await requestAddress()}`)
  if (!byIp.allowed) return json({ ok: false, message: tooManyAttempts(byIp.retryAfterSeconds ?? 60) }, 429)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const outcome = await loginOptions(deps)
  if (!outcome.ok) return json({ ok: false, message: outcome.message }, outcome.status)
  await setChallengeCookie(outcome.cookie ?? '')
  return json({ ok: true, options: outcome.options })
}

/** POST /api/passkeys/login-verify: signs the person in, or hands back a pending token for the two-step code. */
export async function loginVerifyResponse(request: Request): Promise<Response> {
  if (!(await sameSite(request))) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.flags.accounts) return json({ ok: false, message: UNAVAILABLE }, 404)
  const byIp = await guardAttempt(context.engine, 'passkey', `ip:${await requestAddress()}`)
  if (!byIp.allowed) return json({ ok: false, message: tooManyAttempts(byIp.retryAfterSeconds ?? 60) }, 429)
  const body = await readJson(request)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const outcome = await loginWithPasskey(deps, body as never, await challengeFromRequest())
  await clearChallengeCookie()
  if (outcome.status === 'refused') return json({ ok: false, message: outcome.message }, 400)
  if (outcome.status === 'two-factor') return json({ ok: false, twoFactorRequired: true, pendingToken: outcome.pendingToken }, 200)
  await setSessionCookie(outcome.token)
  const next = typeof body.next === 'string' ? body.next : ''
  const adminArea = body.area === 'admin'
  const redirect = adminArea ? (next.startsWith('/admin') && !next.startsWith('//') && !next.includes('\\') ? next : '/admin') : safeLandingPath(next)
  return json({ ok: true, redirect })
}

/** GET /api/passkeys/list: the signed-in person's passkeys, without key material. */
export async function listResponse(request: Request): Promise<Response> {
  const context = await accountContext()
  if (!context.user) return json({ ok: false, message: SIGNED_OUT }, 401)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  return json({ ok: true, enabled: deps.settings.enabled, passkeys: await listPasskeys(deps, Number((context.user as { id: number }).id)) })
}

/** POST /api/passkeys/rename: body { id, label }. The id must belong to the signed-in person. */
export async function renameResponse(request: Request): Promise<Response> {
  if (!(await sameSite(request))) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.user) return json({ ok: false, message: SIGNED_OUT }, 401)
  const body = await readJson(request)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const result = await renamePasskey(deps, Number((context.user as { id: number }).id), Number(body.id), body.label)
  return json(result, result.ok ? 200 : 400)
}

/** POST /api/passkeys/remove: body { id, password? , code? }. Re-authentication and the last-method rule apply. */
export async function removeResponse(request: Request): Promise<Response> {
  if (!(await sameSite(request))) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.user) return json({ ok: false, message: SIGNED_OUT }, 401)
  const userId = Number((context.user as { id: number }).id)
  const limited = await guardAttempt(context.engine, 'passkey', `user:${userId}`)
  if (!limited.allowed) return json({ ok: false, message: tooManyAttempts(limited.retryAfterSeconds ?? 60) }, 429)
  const body = await readJson(request)
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const result = await removePasskey(deps, userId, Number(body.id), {
    password: typeof body.password === 'string' ? body.password : undefined,
    code: typeof body.code === 'string' ? body.code : undefined,
  })
  return json({ ok: result.ok, message: result.message }, result.ok ? 200 : (result.status ?? 400))
}

/** GET /api/passkeys/availability?area=account|admin: whether the sign-in screen should show the passkey button. */
export async function availabilityResponse(request: Request): Promise<Response> {
  const context = await accountContext()
  if (!context.flags.accounts) return json({ enabled: false })
  const area = new URL(request.url).searchParams.get('area') === 'admin' ? 'admin' : 'account'
  const deps = await passkeyDepsFor(context.engine, await requestClient(), request.url)
  const allowed = deps.settings.enabled && (area === 'account' || deps.settings.allowAdmins) && deps.secret.length > 0
  return json({ enabled: allowed })
}
