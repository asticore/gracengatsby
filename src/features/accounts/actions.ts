'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  completePasswordReset,
  emailProblem,
  passwordProblem,
  registerCustomer,
  requestPasswordReset,
  signIn,
} from './auth'
import {
  createAddress,
  deleteAddress,
  sanitiseAddress,
  setDefaultAddress,
  updateAddress,
} from './addresses'
import { changeEmail, changeName, changePassword } from './profile'
import { guardAttempt, tooManyAttempts } from './rateLimit'
import {
  accountContext,
  clearSessionCookie,
  requestAddress,
  setSessionCookie,
  siteOrigin,
  type AccountContext,
} from './session'
import { NEUTRAL_EMAIL_NOTICE, failed, succeeded, type ActionState } from './types'

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

export async function signInAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'sign-in', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const result = await signIn(context.engine, text(form, 'email'), text(form, 'password'))
  if (!result.ok || !result.token) return failed(result.message ?? 'That did not work.')

  await setSessionCookie(result.token)
  redirect(safeNext(form.get('next')))
}

export async function signOutAction(): Promise<void> {
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
export async function registerAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF

  const guard = await guardAttempt(context.engine, 'register', await requestAddress())
  if (!guard.allowed) return failed(tooManyAttempts(guard.retryAfterSeconds ?? 60))

  const email = text(form, 'email')
  const password = text(form, 'password')

  const badEmail = emailProblem(email)
  if (badEmail) return failed(badEmail)

  const badPassword = passwordProblem(password)
  if (badPassword) return failed(badPassword)
  if (password !== text(form, 'passwordConfirm')) return failed('The two passwords do not match.')

  const origin = await siteOrigin()
  await registerCustomer(context.engine, email, password, {
    signIn: `${origin}/account/sign-in`,
    forgotPassword: `${origin}/account/forgot-password`,
    account: `${origin}/account`,
  })

  return succeeded(
    'Thanks. If that address could be used, your account is ready - check your inbox, then sign in.',
  )
}

// --- Forgotten password -----------------------------------------------------

export async function forgotPasswordAction(
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

export async function resetPasswordAction(
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

  // No session is minted here. Whoever opened the link has proven they can
  // read the mailbox; signing in with the new password proves they know it.
  redirect('/account/sign-in?reset=1')
}

// --- Addresses --------------------------------------------------------------

export async function saveAddressAction(_state: ActionState, form: FormData): Promise<ActionState> {
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

export async function deleteAddressAction(
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

export async function setDefaultAddressAction(
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

export async function saveNameAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const result = await changeName(context.engine, context.user, text(form, 'name'))
  revalidatePath('/account/profile')
  return result.ok ? succeeded(result.message) : failed(result.message)
}

export async function changeEmailAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const result = await changeEmail(
    context.engine,
    context.user,
    text(form, 'email'),
    text(form, 'currentPassword'),
  )
  if (!result.ok) return failed(result.message ?? 'That did not work.')

  if (result.token) await setSessionCookie(result.token ?? '')
  revalidatePath('/account/profile')
  return succeeded(result.message)
}

export async function changePasswordAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await openContext()
  if (!context) return FEATURE_OFF
  if (!context.user) return SIGNED_OUT

  const result = await changePassword(
    context.engine,
    context.user,
    text(form, 'currentPassword'),
    text(form, 'password'),
    text(form, 'passwordConfirm'),
  )
  if (!result.ok) return failed(result.message ?? 'That did not work.')

  if (result.token) await setSessionCookie(result.token ?? '')
  return succeeded(result.message)
}
