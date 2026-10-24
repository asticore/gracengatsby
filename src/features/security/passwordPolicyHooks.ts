import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from '@/engine'

/**
 * Users hooks for the password policy. Both are reachable from the Users
 * collection config, which the database layer imports, so every heavy module
 * (the store, the settings reader, the hashing) is imported lazily, the same way
 * passwordSessionHook.ts does it.
 *
 * `enforcePasswordPolicyBeforeChange` checks a password set by a signed-in actor
 * (an admin on the Users screen, or the REST API). It does not check system
 * writes (the first admin, an import, a customer registration): those have no
 * actor, and registration is checked by its own action before it writes.
 *
 * `recordPasswordAfterChange` stamps `password_changed_at` and the history after
 * every password write that goes through the collection, for any caller.
 */

type Req = { user?: { id?: number | string } | null; engine?: unknown }

export const enforcePasswordPolicyBeforeChange: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation } = args as {
    data?: { password?: unknown; email?: unknown }
    originalDoc?: { id?: number | string; email?: string }
    req?: Req
    operation?: string
  }
  if (typeof data?.password !== 'string' || data.password.length === 0) return
  if (!req?.user || !req.engine) return

  const { passwordProblemFor } = await import('./passwordCheck')
  const email = typeof data.email === 'string' ? data.email : originalDoc?.email
  const id = operation === 'update' ? originalDoc?.id : undefined
  const problem = await passwordProblemFor(req.engine as never, data.password, { id, email: email ?? null }, { adminScreen: true })
  if (problem) throw new Error(problem)
}

export const recordPasswordAfterChange: CollectionAfterChangeHook = async (args) => {
  const { doc, data } = args as unknown as { doc?: { id?: number | string }; data?: { password?: unknown } }
  if (typeof data?.password !== 'string' || data.password.length === 0) return doc as never
  const id = Number(doc?.id)
  if (!Number.isInteger(id) || id <= 0) return doc as never
  try {
    const { recordPasswordSet } = await import('./passwordStore')
    await recordPasswordSet(id, data.password)
  } catch (error) {
    // A history write must never stop a password change.
    console.warn(JSON.stringify({ level: 'warn', msg: 'Password history not recorded', error: String(error) }))
  }
  return doc as never
}
