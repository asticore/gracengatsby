'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { passwordProblemFor } from '@/features/security/passwordCheck'
import { recordAuthEvent } from '@/features/security/authAudit'

import {
  completePasswordReset,
  completeVerification,
  emailProblem,
  registerCustomer,
  requestPasswordReset,
  resendCooldownSeconds,
  resendVerification,
  signIn,
  signInWithCode,
} from './auth'
import {
  createAddress,
  deleteAddress,
  sanitiseAddress,
  setDefaultAddress,
  updateAddress,
} from './addresses'
import { changeEmail, changeName, changePassword } from './profile'
import { writePreferences } from './preferences'
import { isLocaleRoutable } from '@/features/multilingual/routing'
import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'
import { guardAttempt, tooManyAttempts } from './rateLimit'
import {
  accountContext,
  clearSessionCookie,
  currentSessionToken,
  requestClient,
  requestAddress,
  setSessionCookie,
  setTrustedDeviceCookie,
  siteOrigin,
  type AccountContext,
} from './session'
import { sessionIdFromToken } from '@/features/security/userSessions'
import { NEUTRAL_EMAIL_NOTICE, USERS_SLUG, failed, succeeded, type ActionState } from './types'
import { confirmLink, requestLogin, safeLandingPath, verifyCode } from '@/features/passwordless'
import { passwordlessDepsFor } from './passwordlessWiring'
import { accountTexts } from './portalCopy'
import { localiseMessage } from './messages'

/**
 * Everything the account screens submit to.
 *
 * Server actions rather than API routes: the session cookie arrives on its
 * own, there is no hand-rolled auth to get wrong, and there is no URL for
 * anybody to probe independently of the form it belongs to.
 *
 * Four rules hold across every action below.
 *   1. The feature flag is checked first. Off means these do nothing at all,
 *      not merely that the links are hidden.
 *   2. The customer is the session's, always. Nothing takes an id from a form.
 *   3. Writes go through the collection's own access rule with that user
 *      attached, so an id belonging to somebody else fails on the rule.
 *   4. The three unauthenticated actions are rate limited per address.
 */

const FEATURE_OFF = failed('Accounts are not available on this site.')
const PORTAL_LANGUAGE_INVALID = 'That language is not available on this site.'
const SIGNED_OUT = failed('Your session has ended. Sign in and try again.')

/** The shared preamble: flags, engine, session. */
const openContext = async (): Promise<AccountContext | null> => {
  const context = await accountContext()
  return context.flags.accounts ? context : null
}

/**
 * Only ever inside our own account area.
 *
 * The sign-in form carries where to go next, and a form field is something a
 * link can set - so an emailed "sign in and you'll be taken to..." must not be
 * able to point at another site, or at the admin area.
 */
const safeNext = (value: FormDataEntryValue | null): string => {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/account') && !next.startsWith('//') ? next : '/account'
}

const text = (form: FormData, field: string): string => {
  const value = form.get(field)
  return typeof value === 'string' ? value : ''
}

// --- Sign in, out, register -------------------------------------------------

async function signInActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'sign-in', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const address = text(form, 'email').trim().toLowerCase()
  const origin = await requestClient()
  const result = await signIn(context.engine, text(form, 'email'), text(form, 'password'), origin)
  if (result.needsTwoFactor && result.pendingToken) {
    return { status: 'idle', message: '', pendingToken: result.pendingToken }
  }
  if (!result.ok || !result.token) {
    if (result.reason) {
      await recordAuthEvent(context.engine, {
        action: result.reason === 'locked' ? 'login.locked' : 'login.failed',
        actorEmail: address || null,
        detail: 'password step',
      }, origin)
    } else if (result.needsVerification) {
      await recordAuthEvent(context.engine, { action: 'email.refused', actorEmail: address || null, detail: 'sign-in held back: email not verified' }, origin)
    }
    return { ...failed(result.message ?? 'That did not work.'), code: result.needsVerification ? 'verify-first' : undefined }
  }

  await recordAuthEvent(context.engine, { action: 'login.success', actorId: result.userId ?? null, actorEmail: address || null }, origin)
  await setSessionCookie(result.token)
  redirect(safeNext(form.get('next')))
}

/**
 * Second step of a two-step sign-in. Its own rate-limit bucket ('two-factor'),
 * and a wrong code also counts toward the account lockout.
 */
async function signInCodeActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const pendingToken = text(form, 'pendingToken')
  const guard = await guardAttempt(context.engine, 'two-factor', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const origin = await requestClient()
  const result = await signInWithCode(context.engine, pendingToken, text(form, 'code'), origin, {
    method: text(form, 'method') === 'email' ? 'email' : 'app',
    trustDevice: text(form, 'trustDevice') === 'on',
  })
  if (!result.ok || !result.token) {
    await recordAuthEvent(context.engine, {
      action: result.reason === 'locked' ? 'login.locked' : 'two-factor.failed',
      detail: 'code step',
    }, origin)
    // The same pending token stays valid for its few minutes, so a typo does not mean starting over.
    return { status: 'error', message: result.message ?? 'That did not work.', pendingToken }
  }

  await recordAuthEvent(context.engine, { action: 'two-factor.verified', actorId: result.userId ?? null }, origin)
  await recordAuthEvent(context.engine, { action: 'login.success', actorId: result.userId ?? null, detail: 'two-step' }, origin)
  await setSessionCookie(result.token)
  if (result.trustedDevice) await setTrustedDeviceCookie(result.trustedDevice.token, result.trustedDevice.maxAgeSeconds)
  // A social sign-in parks its pending token here; it has done its job.
  ;(await cookies()).delete('eg_social_pending')
  redirect(safeNext(form.get('next')))
}

export async function signOutAction(): Promise<void> {
  // End the session on the server too, not just in this browser, so the token
  // cannot be replayed and the device list stops showing it. Best effort: the
  // cookie is cleared either way.
  try {
    const context = await accountContext()
    const who = context.user as { id?: number | string; email?: string } | null
    await context.engine.logout({ collection: USERS_SLUG, headers: await headers() })
    if (who) {
      await recordAuthEvent(context.engine, { action: 'logout', actorId: who.id ?? null, actorEmail: who.email ?? null, detail: 'this device' }, await requestClient())
    }
  } catch {
    // Signing out of this browser must never fail.
  }
  await clearSessionCookie()
  redirect('/account/sign-in')
}

/**
 * Registration, which answers the same way whether or not the address was
 * free.
 *
 * The alternative - signing a new customer straight in, and telling anybody
 * else that the address is taken - makes this form a way to test email
 * addresses against the customer list. So both outcomes end on the same
 * screen, and the mailbox owner is emailed either a welcome or a "you already
 * have an account" note.
 */
async function registerActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'register', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const email = text(form, 'email')
  const password = text(form, 'password')

  const badEmail = emailProblem(email)
  if (badEmail) return failed(badEmail)

  const badPassword = await passwordProblemFor(context.engine, password, { email })
  if (badPassword) return failed(badPassword)
  if (password !== text(form, 'passwordConfirm')) return failed('The two passwords do not match.')

  const origin = await siteOrigin()
  await registerCustomer(context.engine, email, password, {
    signIn: `${origin}/account/sign-in`,
    forgotPassword: `${origin}/account/forgot-password`,
    account: `${origin}/account`,
  }, (token) => `${origin}/account/verify-email?token=${encodeURIComponent(token)}`)

  return succeeded(
    'Thanks. If that address could be used, your account is ready - check your inbox, then sign in.',
  )
}

// --- Forgotten password -----------------------------------------------------

async function forgotPasswordActionImpl(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'reset', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const origin = await siteOrigin()
  await requestPasswordReset(
    context.engine,
    text(form, 'email'),
    (token) => `${origin}/account/reset-password?token=${encodeURIComponent(token)}`,
  )

  // Said whether the address was found or not, and after the same work either
  // way, so the answer carries no information about who has an account.
  return succeeded(NEUTRAL_EMAIL_NOTICE)
}

async function resetPasswordActionImpl(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'reset', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const password = text(form, 'password')
  if (password !== text(form, 'passwordConfirm')) return failed('The two passwords do not match.')

  const result = await completePasswordReset(context.engine, text(form, 'token'), password)
  if (!result.ok) return failed(result.message ?? 'That did not work.')
  await recordAuthEvent(context.engine, { action: 'password.reset', actorId: result.userId ?? null, detail: 'emailed link' }, await requestClient())

  // No session is minted here. Whoever opened the link has proven they can
  // read the mailbox; signing in with the new password proves they know it.
  redirect('/account/sign-in?reset=1')
}

// --- Email verification -----------------------------------------------------

async function verifyEmailActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'verify', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const result = await completeVerification(context.engine, text(form, 'token'))
  await recordAuthEvent(
    context.engine,
    result.ok ? { action: 'email.verified', actorId: result.userId ?? null } : { action: 'email.refused', detail: 'link expired or already used' },
    await requestClient(),
  )
  if (!result.ok) return failed(result.message ?? 'That did not work.')
  return succeeded('Your email address is confirmed. You can sign in now.')
}

async function resendVerificationActionImpl(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'verify', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const origin = await siteOrigin()
  await resendVerification(
    context.engine,
    text(form, 'email'),
    (token) => `${origin}/account/verify-email?token=${encodeURIComponent(token)}`,
  )
  // The wait is the same for everyone, so saying it reveals nothing about the address.
  const wait = await resendCooldownSeconds(context.engine)
  return succeeded(wait > 0 ? `${NEUTRAL_EMAIL_NOTICE} You can ask for another in ${wait} seconds.` : NEUTRAL_EMAIL_NOTICE)
}

// --- Addresses --------------------------------------------------------------

async function saveAddressActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const input = sanitiseAddress(form)
  const rawId = text(form, 'id')

  // An id here only ever names a row to act on; whether the caller may act on
  // it is decided by the collection, not by this check.
  const id = Number(rawId)
  const result =
    rawId && Number.isInteger(id) && id > 0
      ? await updateAddress(context.engine, context.user, id, input)
      : await createAddress(context.engine, context.user, input)

  if (!result.ok) return failed(result.message ?? 'That did not work.')

  revalidatePath('/account/addresses')
  redirect('/account/addresses')
}

async function deleteAddressActionImpl(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const id = Number(text(form, 'id'))
  if (!Number.isInteger(id) || id <= 0) return failed('That address could not be removed.')

  const result = await deleteAddress(context.engine, context.user, id)
  if (!result.ok) return failed(result.message ?? 'That did not work.')

  revalidatePath('/account/addresses')
  return succeeded('That address has been removed.')
}

async function setDefaultAddressActionImpl(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const id = Number(text(form, 'id'))
  if (!Number.isInteger(id) || id <= 0) return failed('That address could not be found.')

  const result = await setDefaultAddress(context.engine, context.user, id)
  if (!result.ok) return failed(result.message ?? 'That did not work.')

  revalidatePath('/account/addresses')
  return succeeded('Default address updated.')
}

// --- Profile ----------------------------------------------------------------

async function saveNameActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const result = await changeName(context.engine, context.user, text(form, 'name'))
  revalidatePath('/account/profile')
  return result.ok ? succeeded(result.message) : failed(result.message)
}

/**
 * The portal language. Empty clears the choice (automatic: cookie, then browser). Anything else must be one of
 * the site's active locales, and the refusal names no other language.
 */
async function saveLanguageActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const requested = text(form, 'locale').trim()
  const settings = await readMultilingualSettingsFromD1()
  if (requested && !(isLocaleRoutable(settings) && settings.activeLocales.includes(requested))) {
    return failed(PORTAL_LANGUAGE_INVALID)
  }

  await writePreferences(context.engine, context.user, { locale: requested || null })
  revalidatePath('/account', 'layout')
  return succeeded(requested ? 'Your language has been saved.' : 'Your language will follow your browser.')
}

async function changeEmailActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return failed(blocked)

  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const result = await changeEmail(
    context.engine,
    context.user,
    text(form, 'email'),
    text(form, 'currentPassword'),
    await requestClient(),
  )
  if (!result.ok) return failed(result.message ?? 'That did not work.')

  if (result.token) await setSessionCookie(result.token ?? '')
  revalidatePath('/account/profile')
  return succeeded(result.message)
}

async function changePasswordActionImpl(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return failed(blocked)

  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const result = await changePassword(
    context.engine,
    context.user,
    text(form, 'currentPassword'),
    text(form, 'password'),
    text(form, 'passwordConfirm'),
    await requestClient(),
    sessionIdFromToken(await currentSessionToken()),
  )
  if (!result.ok) return failed(result.message ?? 'That did not work.')

  if (result.token) await setSessionCookie(result.token ?? '')
  return succeeded(result.message)
}

// --- Passwordless sign-in (emailed link or code) ----------------------------

/**
 * Asks for a link or a code. The answer is the same sentence for every address
 * that is well formed, so the reply never shows whether an account exists. The
 * per-address and per-IP limits are counted before anything is looked up.
 */
async function requestLoginActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const kind = text(form, 'kind') === 'code' ? 'code' : 'link'
  const address = text(form, 'email').trim().toLowerCase()
  const ip = await requestAddress()

  const byIp = await guardAttempt(context.engine, 'passwordless-request', `ip:${ip}`)
  if (!byIp.allowed) return failed(tooManyAttempts(byIp.retryAfterSeconds ?? 60))
  const byEmail = await guardAttempt(context.engine, 'passwordless-request', `email:${address}`)
  if (!byEmail.allowed) return failed(tooManyAttempts(byEmail.retryAfterSeconds ?? 60))

  const client = await requestClient()
  const deps = await passwordlessDepsFor(context.engine, client)
  const origin = await siteOrigin()
  const next = safeLandingPath(text(form, 'next'))

  const outcome = await requestLogin(deps, {
    email: address,
    kind,
    linkFor: (token) =>
      `${origin}/account/sign-in/link?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`,
  })
  if (!outcome.ok) return failed(outcome.message)
  return { status: 'success', message: outcome.message, kind, email: address }
}

/** The six-digit code, typed with the address it was sent to. */
async function verifyCodeActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const email = text(form, 'email').trim().toLowerCase()
  const byIp = await guardAttempt(context.engine, 'passwordless-verify', `ip:${await requestAddress()}`)
  if (!byIp.allowed) return failed(tooManyAttempts(byIp.retryAfterSeconds ?? 60))
  const byEmail = await guardAttempt(context.engine, 'passwordless-verify', `email:${email}`)
  if (!byEmail.allowed) return failed(tooManyAttempts(byEmail.retryAfterSeconds ?? 60))

  const deps = await passwordlessDepsFor(context.engine, await requestClient())
  const outcome = await verifyCode(deps, email, text(form, 'code'))
  if (outcome.status === 'refused') return failed(outcome.message)
  if (outcome.status === 'two-factor') return { status: 'idle', message: '', pendingToken: outcome.pendingToken }

  await setSessionCookie(outcome.token)
  redirect(safeLandingPath(text(form, 'next')))
}

/**
 * The confirm button on an emailed link. The page only shows the button; this is
 * the one place the link is spent, so a mail scanner that fetches the URL cannot
 * sign anyone in or use the link up.
 */
async function confirmLinkActionImpl(_state: ActionState, form: FormData): Promise<ActionState> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return failed(blocked)

  const context = await openContext()
  if (!context) return FEATURE_OFF

  const byIp = await guardAttempt(context.engine, 'passwordless-verify', `ip:${await requestAddress()}`)
  if (!byIp.allowed) return failed(tooManyAttempts(byIp.retryAfterSeconds ?? 60))

  const deps = await passwordlessDepsFor(context.engine, await requestClient())
  const outcome = await confirmLink(deps, text(form, 'token'))
  if (outcome.status === 'refused') return failed(outcome.message)
  if (outcome.status === 'two-factor') return { status: 'idle', message: '', pendingToken: outcome.pendingToken }

  await setSessionCookie(outcome.token)
  redirect(safeLandingPath(text(form, 'next')))
}

// --- Portal language for messages -----------------------------------------
/**
 * Every action's sentence is written in English by the services. This hands the
 * visitor the same sentence in their language (see `messages.ts`). Redirects
 * still throw straight through, so a successful submit is unchanged.
 */
async function localisedState(result: ActionState): Promise<ActionState> {
  if (!result.message) return result
  const tx = await accountTexts()
  return { ...result, message: localiseMessage(result.message, tx) }
}

export async function signInAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await signInActionImpl(state, form))
}

export async function signInCodeAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await signInCodeActionImpl(state, form))
}

export async function registerAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await registerActionImpl(state, form))
}

export async function forgotPasswordAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await forgotPasswordActionImpl(state, form))
}

export async function resetPasswordAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await resetPasswordActionImpl(state, form))
}

export async function verifyEmailAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await verifyEmailActionImpl(state, form))
}

export async function resendVerificationAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await resendVerificationActionImpl(state, form))
}

export async function saveAddressAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await saveAddressActionImpl(state, form))
}

export async function deleteAddressAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await deleteAddressActionImpl(state, form))
}

export async function setDefaultAddressAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await setDefaultAddressActionImpl(state, form))
}

export async function saveNameAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await saveNameActionImpl(state, form))
}

export async function saveLanguageAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await saveLanguageActionImpl(state, form))
}

export async function changeEmailAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await changeEmailActionImpl(state, form))
}

export async function changePasswordAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await changePasswordActionImpl(state, form))
}

export async function requestLoginAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await requestLoginActionImpl(state, form))
}

export async function verifyCodeAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await verifyCodeActionImpl(state, form))
}

export async function confirmLinkAction(state: ActionState, form: FormData): Promise<ActionState> {
  return localisedState(await confirmLinkActionImpl(state, form))
}
