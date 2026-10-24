import { notFound, redirect } from 'next/navigation'
import type { Engine } from '@/engine'

import { accountContext, type AccountUser } from './session'
import type { FeatureFlags } from '@/features/registry'
import { MEMBER_ENROL_PATH, assertTwoFactorSatisfied } from '@/features/security/twoFactor'
import { getSecuritySettings } from '@/features/security/settings'

/**
 * The two guards every account screen starts with.
 *
 * The flag check comes first and answers with a 404 rather than a message,
 * because a site that has not switched customer accounts on should look like a
 * site that does not have them - a "this is disabled" page still tells anyone
 * probing that the software is there and what it does.
 *
 * The sign-in redirect carries where the visitor was going, so following a
 * bookmarked order link lands on that order after signing in rather than on a
 * dashboard. Only paths inside `/account` survive that round trip; see
 * `safeNext` in actions.ts.
 */

export type SignedIn = { engine: Engine; flags: FeatureFlags; user: AccountUser }

export const requireFeature = async () => {
  const context = await accountContext()
  if (!context.flags.accounts) notFound()
  return context
}

export const requireCustomer = async (returnTo: string): Promise<SignedIn> => {
  const context = await requireFeature()
  if (!context.user) redirect(`/account/sign-in?next=${encodeURIComponent(returnTo)}`)

  // Only when the "require two-step for customers" setting is on and this
  // customer has not set it up: take them to the Security section of their
  // profile. Not a lockout - that page, and signing out, stay open - and a
  // no-op while the setting is off (the default).
  if (returnTo !== MEMBER_ENROL_PATH && !(context.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) {
    const settings = await getSecuritySettings(context.engine as never).catch((): null => null)
    const status = settings ? assertTwoFactorSatisfied(context.user as never, settings) : null
    if (status?.mustEnrol && status.enrolPath) redirect(`${status.enrolPath}#security`)
  }
  return context as SignedIn
}

/** Signed-in visitors have no business on the sign-in or register screens. */
export const redirectIfSignedIn = async () => {
  const context = await requireFeature()
  if (context.user) redirect('/account')
  return context
}
