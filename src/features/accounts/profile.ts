import type { Payload } from '@/engine'

import { emailProblem, passwordProblem, signIn, verifyPassword } from './auth'
import { writePreferences } from './preferences'
import type { AccountUser } from './session'
import { USERS_SLUG } from './types'

/**
 * Changing the name, the email address and the password.
 *
 * Two rules run through all of it.
 *
 * The current password is required before the email or the password changes,
 * and is checked against the engine rather than against anything held in the
 * session. A signed-in browser left open on a shared machine should not be
 * enough to lock the real owner out of their own account, and both of those
 * changes do exactly that if they are allowed to go through unchallenged.
 *
 * The write goes through the collection's own access rule with the session
 * user attached - `isAdminOrSelf` on Users - rather than overriding it. The id
 * is the session's, so the rule and the id agree by construction; if a future
 * change to that rule locked customers out of their own row, this would start
 * failing rather than start ignoring it.
 */

export type ProfileOutcome = { ok: boolean; token?: string; message: string }

const CURRENT_PASSWORD_WRONG = 'That is not your current password.'

export const changeName = async (
  engine: Payload,
  user: AccountUser,
  name: string,
): Promise<ProfileOutcome> => {
  const trimmed = name.trim().slice(0, 120)
  await writePreferences(engine, user, { name: trimmed })
  return { ok: true, message: 'Your name has been saved.' }
}

/**
 * A new email address, after re-proving the current password.
 *
 * The session token carries the old address, so a fresh one is minted with the
 * new credentials and handed back for the caller to set - otherwise the
 * customer is signed out by their own successful change.
 */
export const changeEmail = async (
  engine: Payload,
  user: AccountUser,
  nextEmail: string,
  currentPassword: string,
): Promise<ProfileOutcome> => {
  const email = nextEmail.trim().toLowerCase()
  const problem = emailProblem(email)
  if (problem) return { ok: false, message: problem }

  const currentEmail = typeof user.email === 'string' ? user.email : ''
  if (!(await verifyPassword(engine, currentEmail, currentPassword))) {
    return { ok: false, message: CURRENT_PASSWORD_WRONG }
  }

  if (email === currentEmail.toLowerCase()) {
    return { ok: true, message: 'That is already your email address.' }
  }

  try {
    await engine.update({
      collection: USERS_SLUG,
      id: user.id,
      data: { email },
      overrideAccess: false,
      user,
    })
  } catch {
    // A taken address lands here. Naming the reason would turn this form into
    // a way to test which addresses have accounts.
    return { ok: false, message: 'That email address cannot be used.' }
  }

  const session = await signIn(engine, email, currentPassword)
  return {
    ok: true,
    token: session.ok ? session.token : undefined,
    message: 'Your email address has been changed.',
  }
}

/**
 * A new password, after re-proving the old one.
 *
 * The session is re-minted on success so the token in the browser is not one
 * that was issued under the previous password.
 */
export const changePassword = async (
  engine: Payload,
  user: AccountUser,
  currentPassword: string,
  nextPassword: string,
  confirmation: string,
): Promise<ProfileOutcome> => {
  const problem = passwordProblem(nextPassword)
  if (problem) return { ok: false, message: problem }
  if (nextPassword !== confirmation) return { ok: false, message: 'The two passwords do not match.' }

  const email = typeof user.email === 'string' ? user.email : ''
  if (!(await verifyPassword(engine, email, currentPassword))) {
    return { ok: false, message: CURRENT_PASSWORD_WRONG }
  }

  try {
    await engine.update({
      collection: USERS_SLUG,
      id: user.id,
      data: { password: nextPassword },
      overrideAccess: false,
      user,
    })
  } catch {
    return { ok: false, message: 'That password could not be saved.' }
  }

  const session = await signIn(engine, email, nextPassword)
  return {
    ok: true,
    token: session.ok ? session.token : undefined,
    message: 'Your password has been changed.',
  }
}
