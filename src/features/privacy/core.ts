import type { UiStringKey } from '@/features/uiStrings/keys'

/**
 * Privacy requests: the rules shared by the customer screens, the admin screen and the tests.
 * No database or session here. Everything that reads or writes goes through the store (store.ts)
 * or the engine (erase.ts, export.ts).
 *
 * Two promises this file keeps:
 *   1. A data export never carries a password hash, a salt, a token, a two-step secret, a backup
 *      code, a passkey or an API key. Fields are chosen by an allow-list, and a deny-list pattern
 *      strips anything secret-looking that slips into a JSON column.
 *   2. An erasure keeps order totals (tax records) and strips who bought: name, email, address,
 *      notes and the customer link. See `anonymisedOrderPatch`.
 */

/** Days from the request to the deadline. */
export const DUE_DAYS = 30
/** How long the emailed confirmation link works. */
export const VERIFY_TTL_HOURS = 24
/** A password is not needed to request deletion when the session signed in this recently. */
export const FRESH_LOGIN_MINUTES = 15

export const PRIVACY_STATUSES = ['unverified', 'new', 'in_progress', 'done', 'rejected'] as const
export type PrivacyStatus = (typeof PRIVACY_STATUSES)[number]

export const PRIVACY_STATUS_LABEL_KEYS: Record<PrivacyStatus, UiStringKey> = {
  unverified: 'privacy.status.unverified',
  new: 'privacy.status.new',
  in_progress: 'privacy.status.in_progress',
  done: 'privacy.status.done',
  rejected: 'privacy.status.rejected',
}

export type PrivacyAction = 'approve' | 'reject' | 'erase' | 'verify'

const NEXT: Record<PrivacyAction, { from: readonly PrivacyStatus[]; to: PrivacyStatus }> = {
  verify: { from: ['unverified'], to: 'new' },
  approve: { from: ['new'], to: 'in_progress' },
  reject: { from: ['unverified', 'new', 'in_progress'], to: 'rejected' },
  erase: { from: ['in_progress'], to: 'done' },
}

/** The status a request moves to, or null when the move is not allowed from where it is. */
export function nextStatus(current: PrivacyStatus, action: PrivacyAction): PrivacyStatus | null {
  const rule = NEXT[action]
  return rule.from.includes(current) ? rule.to : null
}

/** The deadline: 30 days after the request was made. */
export function dueDateFor(createdAt: string): string {
  const base = new Date(createdAt)
  if (Number.isNaN(base.getTime())) throw new Error('dueDateFor needs an ISO date')
  return new Date(base.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** True when a request still open is past its deadline. Done and rejected requests are never overdue. */
export function isOverdue(row: { status: PrivacyStatus; dueAt: string }, now: number): boolean {
  if (row.status === 'done' || row.status === 'rejected') return false
  return new Date(row.dueAt).getTime() < now
}

/** True when the session was created recently enough to skip the password. */
export function sessionIsFresh(createdAt: string | null | undefined, now: number): boolean {
  if (!createdAt) return false
  const at = new Date(createdAt).getTime()
  if (Number.isNaN(at)) return false
  return now - at <= FRESH_LOGIN_MINUTES * 60 * 1000 && at <= now + 60 * 1000
}

/** Keys that must never leave the site, whatever table they came from. Matched case-insensitively. */
const SECRET_KEY = /password|salt|hash|secret|token|credential|passkey|twofactor|backup|otp|apikey|sessionid|jti|usid|cookie/i

/** Removes secret-looking keys from any JSON-shaped value, at every depth. */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripSecrets(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue
      out[key] = stripSecrets(inner)
    }
    return out as T
  }
  return value
}

const pick = (source: Record<string, unknown> | null | undefined, fields: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  if (!source) return out
  for (const field of fields) if (source[field] !== undefined) out[field] = source[field]
  return out
}

export const EXPORT_PROFILE_FIELDS = ['id', 'email', 'displayName', 'emailVerifiedAt', 'createdAt', 'updatedAt'] as const
export const EXPORT_ADDRESS_FIELDS = ['id', 'title', 'firstName', 'lastName', 'company', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'phone', 'createdAt'] as const
export const EXPORT_ORDER_FIELDS = [
  'id',
  'orderNumber',
  'invoiceNumber',
  'status',
  'amount',
  'currency',
  'subtotal',
  'discountTotal',
  'shippingTotal',
  'taxTotal',
  'refundedTotal',
  'paidAt',
  'shippedAt',
  'trackingNumber',
  'trackingCarrier',
  'trackingUrl',
  'shippingAddress',
  'customerEmail',
  'customerNote',
  'lineItems',
  'createdAt',
] as const
export const EXPORT_RSVP_FIELDS = ['id', 'name', 'email', 'guestCount', 'notes', 'status', 'createdAt'] as const

export type ExportInput = {
  user: Record<string, unknown>
  addresses: Record<string, unknown>[]
  orders: Record<string, unknown>[]
  bookings: Record<string, unknown>[]
  submissions: { form: string; submittedAt: string | null; values: unknown }[]
  requestedAt: string
}

/**
 * The customer's data as one JSON document. Each section takes only allow-listed fields, and the
 * whole document passes through `stripSecrets` as a second guard.
 *
 * Not included, and said so in the document: the wishlist (kept in the browser, not on the site),
 * and cookie choices (kept without the account, so they cannot be linked to it).
 */
export function buildExportDocument(input: ExportInput): Record<string, unknown> {
  const doc = {
    format: 'engage-customer-data',
    version: 1,
    requestedAt: input.requestedAt,
    account: pick(input.user, EXPORT_PROFILE_FIELDS),
    addresses: input.addresses.map((a) => pick(a, EXPORT_ADDRESS_FIELDS)),
    orders: input.orders.map((o) => pick(o, EXPORT_ORDER_FIELDS)),
    bookings: input.bookings.map((b) => pick(b, EXPORT_RSVP_FIELDS)),
    formSubmissions: input.submissions.map((s) => ({ form: s.form, submittedAt: s.submittedAt, values: s.values })),
    notIncluded: [
      'Wishlist: kept in your browser on this device, not on the site.',
      'Cookie choices: kept without your account, so they cannot be linked to you.',
    ],
  }
  return stripSecrets(doc)
}

/**
 * What an erasure writes over an order. Totals, dates, line prices and tax lines stay, because the
 * tax and accounting records need them. The buyer goes: the customer link, the email, the shipping
 * name and address, free-text notes and checkout answers.
 */
export function anonymisedOrderPatch(): Record<string, unknown> {
  return {
    customer: null,
    customerEmail: null,
    customerNote: null,
    checkoutFields: null,
    notes: null,
    shippingAddress: null,
  }
}

/** Whether an email is the one a form submission holds, ignoring case and spaces. */
export function valuesMentionEmail(values: unknown, email: string): boolean {
  const wanted = email.trim().toLowerCase()
  if (!wanted) return false
  const walk = (value: unknown): boolean => {
    if (typeof value === 'string') return value.trim().toLowerCase() === wanted
    if (Array.isArray(value)) return value.some(walk)
    if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(walk)
    return false
  }
  return walk(values)
}
