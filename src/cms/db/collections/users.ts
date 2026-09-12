import type { Sort, Where } from '@/engine'

import { Users } from '@/collections/Users'

import { createCollectionOps } from '../generic'
import { users, usersRoles, usersSessions } from '../schema'

/**
 * Payload's document shape for the `users` collection - see
 * src/collections/Users.ts. Deliberately narrower than Payload's own: this
 * is the shape ordinary app code should use, so nothing outside the auth
 * system itself ever casually handles a password hash. See `UserAuthRow`
 * below for the full shape (hash/salt/sessions included) a real adapter
 * cutover of Users would need for login to keep working - that is
 * deliberately a SEPARATE, more clearly-named export rather than widening
 * this one, so an accidental `console.log(someUser)` or admin-list column
 * still can't leak a hash by picking up a wider type than it asked for.
 */
export type UserDoc = {
  id: number
  email: string
  roles?: string[] | null
  updatedAt: string
  createdAt: string
}

/**
 * The full row `payload.db.findOne`/`updateOne` see for an existing user -
 * every implicit auth column ../schema/generate.ts's authColumns() adds,
 * confirmed against the real `eg_users` table via `pragma table_info` (see
 * that function's own doc comment), plus `sessions` (see
 * generateAuthSessionsTable's doc comment for why that one needed its own
 * child-table model rather than living in authColumns).
 *
 * This data layer still never GENERATES any of these values itself -
 * hashing a password, minting a session, incrementing loginAttempts - that
 * stays entirely Payload's own auth code (`payload/dist/auth/**`), same
 * reasoning as real file upload/resize staying Payload's job for Media.
 * What changed from the narrower doc comment this type replaces: this data
 * layer now STORES AND RETURNS whatever Payload hands it for these columns
 * (proven in tests/int/cms-db-users.int.spec.ts against a real
 * `payload.login()`/session round trip), because `db.select().from(table)`
 * already selected every column on the real `users` table - hash/salt
 * included - even before this type existed to expose them; only the TS
 * shape and the missing `sessions` child-table wiring were the gap, not the
 * SQL.
 */
export type UserAuthRow = UserDoc & {
  resetPasswordToken?: string | null
  resetPasswordExpiration?: string | null
  salt?: string | null
  hash?: string | null
  loginAttempts?: number | null
  lockUntil?: string | null
  twoFactorEnabled?: boolean | null
  twoFactorSecret?: string | null
  twoFactorConfirmedAt?: string | null
  twoFactorLastUsedStep?: number | null
  sessions?: Array<{ id: string; createdAt?: string | null; expiresAt: string }>
}

const ops = createCollectionOps(users, Users, { sessions: usersSessions }, { selectTables: { roles: usersRoles } })

export const findUsers = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<UserDoc[]>
export const findUserByID = ops.findByID as unknown as (id: number) => Promise<UserDoc | null>
export const countUsers = ops.count
export const createUser = ops.create as unknown as (
  data: Partial<Omit<UserDoc, 'id' | 'updatedAt' | 'createdAt'>> & { email: string },
) => Promise<UserDoc>
export const updateUser = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<UserDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<UserDoc | null>
export const deleteUser = ops.deleteByID

// Full-row variants - for the auth system (the engine.db.ts cutover's
// adapter intercept in src/engage.config.ts, and tests proving login/session
// parity) only. Everything else in the app should use the narrow exports
// above.
export const findUserAuthRowByID = ops.findByID as unknown as (id: number) => Promise<UserAuthRow | null>
export const updateUserAuthRow = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<UserAuthRow | null>

// The two remaining full-row variants the adapter intercept needs -
// `findFaqsPaginated`'s exact shape (find-many by `where` with sort/
// pagination, for `find`/`findOne`/`deleteOne`'s own resolve-then-act) and
// create, both re-exposing the same generic `ops` this file already builds
// with no new logic, the same way findUserAuthRowByID/updateUserAuthRow
// re-expose ops.findByID/ops.updateByID above.
export const findUserAuthRowsPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const createUserAuthRow = ops.create as unknown as (data: Record<string, unknown>) => Promise<UserAuthRow>
