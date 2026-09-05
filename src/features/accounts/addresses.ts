import type { Payload } from '@/engine'
import type { Address } from '@/engage-types'

import { readPreferences, writePreferences } from './preferences'
import type { AccountUser } from './session'
import { ADDRESSES_SLUG } from './types'

/**
 * Saved addresses: list, add, edit, delete, choose a default.
 *
 * Read, update and delete all run against the shop's own ownership rule with
 * `overrideAccess: false`, so an id from a form that belongs to somebody else
 * finds nothing to act on. Create is the one call that cannot be decided by a
 * `where` clause, so the owner is stamped from the session - and the shop's
 * own beforeChange hook stamps it again for the same reason, which means even
 * a `customer` smuggled into the form data is overwritten before it is stored.
 */

/** Everything a customer may set. `customer` is deliberately absent. */
export const ADDRESS_FIELDS = [
  'title',
  'firstName',
  'lastName',
  'company',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
] as const

export type AddressInput = Partial<Record<(typeof ADDRESS_FIELDS)[number], string>>

export type SavedAddress = Address & { isDefault: boolean }

export const addressesForCustomer = async (
  engine: Payload,
  user: AccountUser,
): Promise<SavedAddress[]> => {
  const [{ docs }, preferences] = await Promise.all([
    engine
      .find({
        collection: ADDRESSES_SLUG,
        sort: '-updatedAt',
        limit: 50,
        depth: 0,
        overrideAccess: false,
        user,
      })
      .catch(() => ({ docs: [] as Address[] })),
    readPreferences(engine, user),
  ])

  const addresses = docs as Address[]
  return addresses.map((address) => ({
    ...address,
    isDefault: preferences.defaultAddressId === address.id,
  }))
}

export const addressForCustomer = async (
  engine: Payload,
  user: AccountUser,
  id: string | number,
): Promise<Address | null> => {
  const numeric = Number(id)
  if (!Number.isInteger(numeric) || numeric <= 0) return null

  return (await engine
    .findByID({
      collection: ADDRESSES_SLUG,
      id: numeric,
      depth: 0,
      overrideAccess: false,
      user,
    })
    .catch((): null => null)) as Address | null
}

/** Keeps only the fields a customer is allowed to set, as trimmed strings. */
export const sanitiseAddress = (form: FormData): AddressInput => {
  const input: AddressInput = {}
  for (const field of ADDRESS_FIELDS) {
    const value = form.get(field)
    if (typeof value === 'string' && value.trim()) input[field] = value.trim()
  }
  return input
}

export type AddressOutcome = { ok: boolean; id?: number; message?: string }

const REQUIRED: (keyof AddressInput)[] = ['firstName', 'lastName', 'addressLine1', 'city', 'country']

const missingField = (input: AddressInput): string | null => {
  const missing = REQUIRED.find((field) => !input[field])
  return missing ? 'Fill in the name, street, city and country.' : null
}

export const createAddress = async (
  engine: Payload,
  user: AccountUser,
  input: AddressInput,
): Promise<AddressOutcome> => {
  const problem = missingField(input)
  if (problem) return { ok: false, message: problem }

  try {
    const created = (await engine.create({
      collection: ADDRESSES_SLUG,
      data: { ...input, customer: user.id } as never,
      // The collection lets any signed-in caller create; the owner comes from
      // the session here and is re-stamped by the shop's own hook.
      overrideAccess: false,
      user,
    })) as Address
    return { ok: true, id: created.id }
  } catch {
    return { ok: false, message: 'That address could not be saved.' }
  }
}

export const updateAddress = async (
  engine: Payload,
  user: AccountUser,
  id: number,
  input: AddressInput,
): Promise<AddressOutcome> => {
  const problem = missingField(input)
  if (problem) return { ok: false, message: problem }

  try {
    await engine.update({
      collection: ADDRESSES_SLUG,
      id,
      data: input as never,
      overrideAccess: false,
      user,
    })
    return { ok: true, id }
  } catch {
    // Somebody else's id lands here, as does an id that does not exist. Both
    // get the same answer, so this cannot be used to count the address book.
    return { ok: false, message: 'That address could not be saved.' }
  }
}

export const deleteAddress = async (
  engine: Payload,
  user: AccountUser,
  id: number,
): Promise<AddressOutcome> => {
  try {
    await engine.delete({ collection: ADDRESSES_SLUG, id, overrideAccess: false, user })
  } catch {
    return { ok: false, message: 'That address could not be removed.' }
  }

  // Forgetting the default alongside the row it pointed at.
  const preferences = await readPreferences(engine, user)
  if (preferences.defaultAddressId === id) {
    await writePreferences(engine, user, { defaultAddressId: null })
  }

  return { ok: true, id }
}

/**
 * Marks one address as the default.
 *
 * The id is checked by fetching it under the owner rule first, so a customer
 * cannot point their default at an address that is not theirs - which would
 * otherwise be a way to read one back through the checkout later.
 */
export const setDefaultAddress = async (
  engine: Payload,
  user: AccountUser,
  id: number,
): Promise<AddressOutcome> => {
  const address = await addressForCustomer(engine, user, id)
  if (!address) return { ok: false, message: 'That address could not be found.' }

  await writePreferences(engine, user, { defaultAddressId: address.id })
  return { ok: true, id: address.id }
}
