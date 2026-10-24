import type { Identity } from './flow'
import type { ProviderId } from './providers'
import type { SocialAccountRow, SocialStore } from './store'

/**
 * Who does an identity belong to? The account-linking policy, in one place.
 *
 * The rules, because this is where account takeover would happen:
 *   1. An identity that is already linked signs in as its owner. Nothing else is consulted.
 *   2. Otherwise the provider's email is used ONLY if the provider says it is verified.
 *      No verified email: refuse. Never link, never create.
 *   3. A verified email that matches a STAFF account (anything but customer-only)
 *      is refused. Staff link a provider only from the signed-in security screen.
 *   4. A verified email that matches a CUSTOMER is linked only if that customer's
 *      own address was confirmed too - otherwise someone could pre-register a
 *      victim's address with a password they chose and inherit the account.
 *   5. No match: a customer is created (never any other role) if sign-up via
 *      social is on and the flow was started from the public account area.
 *
 * Everything the policy touches is injected, so it is tested without a database.
 */

export type UserLite = {
  id: number
  email: string
  roles: string[]
  emailVerifiedAt: string | null
}

export type PolicyDeps = {
  store: SocialStore
  findUserByEmail(email: string): Promise<UserLite | null>
  findUserByID(id: number): Promise<UserLite | null>
  /** Creates a customer with a password nobody knows. Returns the new id. */
  createCustomer(email: string, verified: boolean): Promise<number>
  markEmailVerified(id: number): Promise<void>
  settings: { allowSignup: boolean; allowAdmin: boolean; requireVerification: boolean }
  now?: () => string
}

export type RefusalCode =
  | 'no-email'
  | 'unverified-email'
  | 'unverified-account'
  | 'privileged-no-autolink'
  | 'admin-disabled'
  | 'signup-disabled'
  | 'verify-first'
  | 'already-linked'
  | 'not-found'

/** Optional fields rather than a union: this project compiles with strictNullChecks off, where a union keyed on a boolean does not narrow. */
export type Outcome = { ok: boolean; userId?: number; created?: boolean; linked?: boolean; code?: RefusalCode }

const refuse = (code: RefusalCode): Outcome => ({ ok: false, code })

export const isCustomerOnly = (roles: unknown): boolean =>
  Array.isArray(roles) && roles.length > 0 && roles.every((role) => role === 'customer')

const stamp = (deps: PolicyDeps): string => (deps.now ? deps.now() : new Date().toISOString())

async function attach(deps: PolicyDeps, userId: number, identity: Identity): Promise<void> {
  await deps.store.insert({
    userId,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    email: identity.email,
    createdAt: stamp(deps),
    lastLoginAt: stamp(deps),
  })
}

/** Customers held back by the verification setting: a verified provider email for the same address satisfies it. */
async function verificationGate(deps: PolicyDeps, user: UserLite, identity: Identity): Promise<Outcome | null> {
  if (!deps.settings.requireVerification || !isCustomerOnly(user.roles) || user.emailVerifiedAt) return null
  if (identity.emailVerified && identity.email && identity.email === user.email.trim().toLowerCase()) {
    await deps.markEmailVerified(user.id)
    return null
  }
  return refuse('verify-first')
}

/** Sign-in: find or create the account for this identity. */
export async function resolveSignIn(deps: PolicyDeps, identity: Identity, opts: { allowCreate: boolean }): Promise<Outcome> {
  const existing = await deps.store.findByProviderUser(identity.provider, identity.providerUserId)

  if (existing) {
    const user = await deps.findUserByID(existing.userId)
    if (!user) return refuse('not-found')
    if (!isCustomerOnly(user.roles) && !deps.settings.allowAdmin) return refuse('admin-disabled')
    const gate = await verificationGate(deps, user, identity)
    if (gate) return gate
    await deps.store.touchLogin(existing.id, stamp(deps), identity.email)
    return { ok: true, userId: user.id, created: false, linked: false }
  }

  if (!identity.email) return refuse('no-email')
  if (!identity.emailVerified) return refuse('unverified-email')

  const user = await deps.findUserByEmail(identity.email)
  if (user) {
    if (!isCustomerOnly(user.roles)) return refuse('privileged-no-autolink')
    if (!user.emailVerifiedAt) return refuse('unverified-account')
    await attach(deps, user.id, identity)
    return { ok: true, userId: user.id, created: false, linked: true }
  }

  if (!deps.settings.allowSignup || !opts.allowCreate) return refuse('signup-disabled')

  const id = await deps.createCustomer(identity.email, true)
  await attach(deps, id, identity)
  return { ok: true, userId: id, created: true, linked: true }
}

/** Link: the signed-in user connects a provider account. No email matching - they already proved who they are. */
export async function resolveLink(deps: PolicyDeps, userId: number, identity: Identity): Promise<Outcome> {
  const user = await deps.findUserByID(userId)
  if (!user) return refuse('not-found')
  if (!isCustomerOnly(user.roles) && !deps.settings.allowAdmin) return refuse('admin-disabled')

  const existing = await deps.store.findByProviderUser(identity.provider, identity.providerUserId)
  if (existing) {
    return existing.userId === userId ? { ok: true, userId, created: false, linked: false } : refuse('already-linked')
  }

  // One account per provider per user: a second Google account replaces nothing silently.
  const mine = await deps.store.listForUser(userId)
  if (mine.some((row) => row.provider === identity.provider)) return refuse('already-linked')

  await attach(deps, userId, identity)
  return { ok: true, userId, created: false, linked: true }
}

export type UnlinkOutcome = { ok: boolean; message?: string }

/**
 * Removes a link, but never the last way into the account: with no password of
 * their own and no other connected provider, the person would be locked out.
 */
export async function resolveUnlink(
  deps: Pick<PolicyDeps, 'store'> & { hasPassword(userId: number): Promise<boolean> },
  userId: number,
  provider: ProviderId,
): Promise<UnlinkOutcome> {
  const links: SocialAccountRow[] = await deps.store.listForUser(userId)
  if (!links.some((l) => l.provider === provider)) return { ok: false, message: 'That account is not connected.' }
  const others = links.filter((l) => l.provider !== provider).length
  if (others === 0 && !(await deps.hasPassword(userId))) {
    return {
      ok: false,
      message: 'This is the only way you can sign in. Set a password first (use Forgotten your password), then disconnect it.',
    }
  }
  const removed = await deps.store.remove(userId, provider)
  return removed ? { ok: true } : { ok: false, message: 'That account is not connected.' }
}
