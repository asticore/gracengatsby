import { notFound, redirect } from 'next/navigation'
import type { Payload } from 'payload'

import { accountContext, type AccountUser } from './session'
import type { FeatureFlags } from '@/features/registry'

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

export type SignedIn = { engine: Payload; flags: FeatureFlags; user: AccountUser }

export const requireFeature = async () => {
  const context = await accountContext()
  if (!context.flags.accounts) notFound()
  return context
}

export const requireCustomer = async (returnTo: string): Promise<SignedIn> => {
  const context = await requireFeature()
  if (!context.user) redirect(`/account/sign-in?next=${encodeURIComponent(returnTo)}`)
  return context as SignedIn
}

/** Signed-in visitors have no business on the sign-in or register screens. */
export const redirectIfSignedIn = async () => {
  const context = await requireFeature()
  if (context.user) redirect('/account')
  return context
}
