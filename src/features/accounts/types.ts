import type { FeatureKey } from '@/features/registry'

/**
 * Slugs and shared shapes for the customer account area.
 *
 * Nothing here owns a table. Customers are the same `users` rows the shop
 * plugin already writes, orders and addresses belong to the shop, RSVPs to
 * events. This feature is a front-of-site view onto data that already exists,
 * which is why switching it off removes screens and nothing else.
 */

export const ACCOUNTS_FEATURE_KEY: FeatureKey = 'accounts'

export const USERS_SLUG = 'users'
export const ORDERS_SLUG = 'orders'
export const ADDRESSES_SLUG = 'addresses'
export const RSVPS_SLUG = 'event-rsvps'

/**
 * The engine's own per-user key/value store. It already exists, its read and
 * delete access is already restricted to the row's owner, and it needs no
 * schema change - which is what lets this feature hold a display name and a
 * default-address choice without adding a column to a collection it does not
 * own. The string is a collection slug, not a product name.
 */
export const PREFERENCES_SLUG = 'payload-preferences'

/** One row per customer holds everything the account area remembers. */
export const ACCOUNT_PREFERENCE_KEY = 'engage-account-profile'

export type AccountPreferences = {
  name: string
  defaultAddressId: number | null
}

export const EMPTY_PREFERENCES: AccountPreferences = { name: '', defaultAddressId: null }

/** What every form on these screens hands back to its component. */
export type ActionState = {
  status: 'idle' | 'error' | 'success'
  message: string
}

export const IDLE: ActionState = { status: 'idle', message: '' }

export const failed = (message: string): ActionState => ({ status: 'error', message })
export const succeeded = (message: string): ActionState => ({ status: 'success', message })

/**
 * Shown whenever an address is offered a sign-in, a reset or a registration.
 *
 * One sentence, used for every outcome of those three flows, so that none of
 * them can be used to find out which addresses have accounts.
 */
export const NEUTRAL_EMAIL_NOTICE =
  'If that address has an account, we have sent it an email. Check your inbox, and your spam folder.'
