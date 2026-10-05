import type { Engine } from '@/engine'

import type { AccountUser } from './session'
import {
  ACCOUNT_PREFERENCE_KEY,
  EMPTY_PREFERENCES,
  PREFERENCES_SLUG,
  type AccountPreferences,
} from './types'

/**
 * The two things the account area remembers that have nowhere else to live: a
 * display name, and which saved address is the default.
 *
 * WHY NOT A COLUMN
 *
 * A `name` on the customer and an `isDefault` on the address would both be
 * columns on collections this feature does not own - one of them the engine's
 * auth collection, the other built by the shop plugin and only reachable
 * through an override in the config. Adding either means a schema change and a
 * migration for what is, in both cases, one small per-customer choice.
 *
 * The engine already keeps a per-user key/value store, with read and delete
 * access restricted to the owning user, and it needs nothing added to it. So
 * one row per customer holds both. The cost is honest and worth stating: these
 * two values are not visible in the admin area next to the customer, and the
 * default-address marker is not seen by anything outside these screens.
 *
 * WHY THE WRITES LOOK LIKE THIS
 *
 * The store defines access for `read` and `delete` only, so `update` falls
 * back to the engine's default - any signed-in user - which would let one
 * customer overwrite another's row by id. Every write below therefore locates
 * the row through an access-enforced read first and only then updates that id,
 * and a create never carries a user id from anywhere but the session.
 */

const asPreferences = (value: unknown): AccountPreferences => {
  if (!value || typeof value !== 'object') return EMPTY_PREFERENCES
  const raw = value as { name?: unknown; defaultAddressId?: unknown }
  const id = Number(raw.defaultAddressId)
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    defaultAddressId: Number.isFinite(id) && id > 0 ? id : null,
  }
}

type Row = { id: number | string; value?: unknown }

const ownRow = async (engine: Engine, user: AccountUser): Promise<Row | null> => {
  const { docs } = await engine
    .find({
      collection: PREFERENCES_SLUG,
      where: { key: { equals: ACCOUNT_PREFERENCE_KEY } },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    })
    .catch(() => ({ docs: [] as unknown[] }))

  // Filter by owner since the where-builder cannot map the polymorphic user field
  const mine = (docs as Row[]).filter((doc) => {
    const owner = (doc as { user?: unknown }).user
    const first = Array.isArray(owner) ? owner[0] : owner
    if (first === null || first === undefined) return false
    const value =
      typeof first === 'object' ? (first as { value?: unknown; id?: unknown }).value ?? (first as { id?: unknown }).id : first
    const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
    return String(id) === String(user.id)
  })

  return mine[0] ?? null
}

export const readPreferences = async (
  engine: Engine,
  user: AccountUser,
): Promise<AccountPreferences> => asPreferences((await ownRow(engine, user))?.value)

export const writePreferences = async (
  engine: Engine,
  user: AccountUser,
  changes: Partial<AccountPreferences>,
): Promise<AccountPreferences> => {
  const row = await ownRow(engine, user)
  const next: AccountPreferences = { ...asPreferences(row?.value), ...changes }

  if (row) {
    await engine
      .update({
        collection: PREFERENCES_SLUG,
        id: Number(row.id),
        data: { value: next },
        // Safe because `row.id` came back from a read the owner rule vetted.
        overrideAccess: true,
        user,
      })
      .catch((): undefined => undefined)
    return next
  }

  await engine
    .create({
      collection: PREFERENCES_SLUG,
      data: { key: ACCOUNT_PREFERENCE_KEY, user: [user.id], value: next } as never,
      // The store stamps the owner from the session itself, so passing the
      // user is what makes the row theirs - there is no id to spoof.
      overrideAccess: true,
      user,
    })
    .catch((): undefined => undefined)

  return next
}
