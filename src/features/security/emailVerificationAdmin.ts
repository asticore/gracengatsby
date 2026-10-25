import { voidVerificationTokens } from './emailVerificationStore'

/**
 * An administrator marks an account's email address as verified, for the customer who
 * cannot receive the email or an account imported before verification existed. Pure of
 * the framework: the server action passes in what it needs, so this is testable alone.
 */

export type VerifyActor = { id: number | string; email?: string | null; roles?: string[] | null }

export type VerifyOutcome = { ok: boolean; message: string }

export type VerifyAdminDeps = {
  findAccount: (email: string) => Promise<{ id: number; emailVerifiedAt?: string | null } | null>
  setVerified: (id: number, at: string) => Promise<void>
  record: (detail: string, target: { id: number; email: string }) => Promise<void>
  voidTokens?: (id: number) => Promise<void>
  now?: () => Date
}

export async function markAccountEmailVerified(deps: VerifyAdminDeps, actor: VerifyActor | null, email: string): Promise<VerifyOutcome> {
  if (!actor) return { ok: false, message: 'Your session has ended. Sign in and try again.' }
  if (!actor.roles?.includes('admin')) return { ok: false, message: 'Only an administrator can do that.' }

  const address = String(email ?? '').trim().toLowerCase()
  if (!address) return { ok: false, message: 'Enter the email address of the account.' }

  const target = await deps.findAccount(address)
  if (!target) return { ok: false, message: 'No account has that email address.' }
  if (target.emailVerifiedAt) return { ok: true, message: 'That address is already verified.' }

  const at = (deps.now?.() ?? new Date()).toISOString()
  await deps.setVerified(target.id, at)
  await (deps.voidTokens ?? ((id: number) => voidVerificationTokens(id)))(target.id).catch((): undefined => undefined)
  await deps.record(`marked verified by ${actor.email ?? `admin ${actor.id}`}`, { id: target.id, email: address })
  return { ok: true, message: `${address} is now marked as verified.` }
}
