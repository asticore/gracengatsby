import { NextResponse } from 'next/server'

import { requestLogin, safeLandingPath, verifyCode } from '@/features/passwordless'

import { guardAttempt, tooManyAttempts } from './rateLimit'
import { passwordlessDepsFor, passwordlessOptions } from './passwordlessWiring'
import { accountContext, requestAddress, requestClient, setSessionCookie, siteOrigin } from './session'

/**
 * JSON handlers behind the admin sign-in screen, which is a client component and
 * cannot call server actions. The rules are the server actions' rules: the feature
 * flag, the per-address and per-IP limits, the core's role check, and the engine's
 * own sign-in. A cross-site page cannot make these calls: a browser that sends an
 * Origin must send this site's.
 */

const noStore = { 'Cache-Control': 'no-store' }

const json = (body: Record<string, unknown>, status = 200): Response =>
  NextResponse.json(body, { status, headers: noStore })

const sameSite = (request: Request): boolean => {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

const readBody = async (request: Request): Promise<Record<string, string>> => {
  try {
    const data = (await request.json()) as Record<string, unknown>
    return Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value : '']))
  } catch {
    return {}
  }
}

const UNAVAILABLE = 'Accounts are not available on this site.'

export async function optionsResponse(request: Request): Promise<Response> {
  const context = await accountContext()
  if (!context.flags.accounts) return json({ magicLink: false, emailCode: false })
  const area = new URL(request.url).searchParams.get('area') === 'admin' ? 'admin' : 'account'
  return json(await passwordlessOptions(context.engine, area))
}

export async function requestResponse(request: Request): Promise<Response> {
  if (!sameSite(request)) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.flags.accounts) return json({ ok: false, message: UNAVAILABLE }, 404)

  const body = await readBody(request)
  const kind = body.kind === 'code' ? 'code' : 'link'
  const address = (body.email ?? '').trim().toLowerCase()

  const byIp = await guardAttempt(context.engine, 'passwordless-request', `ip:${await requestAddress()}`)
  if (!byIp.allowed) return json({ ok: false, message: tooManyAttempts(byIp.retryAfterSeconds ?? 60) }, 429)
  const byEmail = await guardAttempt(context.engine, 'passwordless-request', `email:${address}`)
  if (!byEmail.allowed) return json({ ok: false, message: tooManyAttempts(byEmail.retryAfterSeconds ?? 60) }, 429)

  const deps = await passwordlessDepsFor(context.engine, await requestClient())
  const origin = await siteOrigin()
  const next = safeLandingPath(body.next)
  const outcome = await requestLogin(deps, {
    email: address,
    kind,
    linkFor: (token) =>
      `${origin}/account/sign-in/link?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`,
  })
  return json({ ok: outcome.ok, message: outcome.message }, outcome.ok ? 200 : 400)
}

export async function verifyResponse(request: Request): Promise<Response> {
  if (!sameSite(request)) return json({ ok: false, message: UNAVAILABLE }, 403)
  const context = await accountContext()
  if (!context.flags.accounts) return json({ ok: false, message: UNAVAILABLE }, 404)

  const body = await readBody(request)
  const address = (body.email ?? '').trim().toLowerCase()

  const byIp = await guardAttempt(context.engine, 'passwordless-verify', `ip:${await requestAddress()}`)
  if (!byIp.allowed) return json({ ok: false, message: tooManyAttempts(byIp.retryAfterSeconds ?? 60) }, 429)
  const byEmail = await guardAttempt(context.engine, 'passwordless-verify', `email:${address}`)
  if (!byEmail.allowed) return json({ ok: false, message: tooManyAttempts(byEmail.retryAfterSeconds ?? 60) }, 429)

  const deps = await passwordlessDepsFor(context.engine, await requestClient())
  const outcome = await verifyCode(deps, address, body.code ?? '')
  if (outcome.status === 'refused') return json({ ok: false, message: outcome.message }, 400)
  if (outcome.status === 'two-factor') return json({ ok: false, twoFactorRequired: true, pendingToken: outcome.pendingToken }, 200)

  await setSessionCookie(outcome.token)
  return json({ ok: true, redirect: safeLandingPath(body.next) })
}
