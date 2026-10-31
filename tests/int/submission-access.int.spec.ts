// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { FormSubmissions } from '@/features/forms/collections/FormSubmissions'
import { exportEndpoint } from '@/features/forms/exportEndpoint'
import { EventRSVPs } from '@/collections/EventRSVPs'
import { isAdminOrRsvpOwner } from '@/features/accounts/access'
import { BUILT_IN_ROLES, resolveAccess } from '@/features/roles/permissions'

/**
 * Who can read form submissions (entries) and event RSVPs (bookings).
 *
 * Form entries: admin, and any role or override with `form-submissions` read at 'all' scope. The
 * built-in editor and viewer roles hold it; the customer role holds nothing. A custom 'own' scope
 * fails closed, because entries have no createdBy to limit them by.
 *
 * Bookings: admin, and any role or override with `event-rsvps` read at 'all' scope. Everyone else,
 * customers included, sees only the bookings left under their own address. Nobody else's.
 */

const ANA = 'ana@example.com'
const BEN = 'ben@example.com'

const customer = { id: 7, email: ANA, roles: ['customer'] }
const admin = { id: 1, email: 'boss@example.com', roles: ['admin'] }
const editor = { id: 2, email: 'editor@example.com', roles: ['editor'] }
const viewer = { id: 3, email: 'viewer@example.com', roles: ['viewer'] }

/** Runs a collection access rule the way the engine does: { req: { user } }. */
const readRule = (rule: unknown, user: unknown) => (rule as (args: { req: { user: unknown } }) => unknown)({ req: { user } })

const formRead = (user: unknown) => readRule(FormSubmissions.access?.read, user)
const rsvpRead = (user: unknown) => readRule(EventRSVPs.access?.read, user)

describe('who can read form submissions', () => {
  it('the collection rule is the permission check for form-submissions read', () => {
    expect(formRead(admin)).toBe(true)
    expect(formRead(editor)).toBe(true)
    expect(formRead(viewer)).toBe(true)
  })

  it('a customer cannot read any entry, not even their own', () => {
    expect(formRead(customer)).toBe(false)
    expect(formRead(null)).toBe(false)
    expect(formRead(undefined)).toBe(false)
  })

  it('an editor without form-submissions read (deny override) cannot read entries', () => {
    const denied = { ...editor, permissionOverrides: { deny: { 'form-submissions': { read: true } } } }
    expect(formRead(denied)).toBe(false)
  })

  it('a custom role with entries limited to own items fails closed', () => {
    const own = { id: 9, roles: ['customer'], customRolePermissions: { 'form-submissions': { read: true, scope: 'own' } } }
    expect(formRead(own)).toBe(false)
  })

  it('a custom role with form-submissions read sees all entries; without it, none', () => {
    expect(formRead({ id: 9, roles: ['customer'], customRolePermissions: { 'form-submissions': { read: true } } })).toBe(true)
    expect(formRead({ id: 9, roles: ['customer'], customRolePermissions: { 'event-rsvps': { read: true } } })).toBe(false)
  })

  it('only admin, editor and viewer built-ins hold form-submissions read', () => {
    const holders = Object.entries(BUILT_IN_ROLES)
      .filter(([, matrix]) => matrix['form-submissions']?.read)
      .map(([role]) => role)
      .sort()
    expect(holders).toEqual(['admin', 'editor', 'viewer'])
  })
})

describe('who can read event RSVPs (bookings)', () => {
  const bookingFor = (email: string) => ({ id: email.length, email, name: 'Guest', guestCount: 1 })

  it('admin reads every booking', () => {
    expect(rsvpRead(admin)).toBe(true)
  })

  it('a staff role with event-rsvps read sees every booking, not just its own', () => {
    expect(rsvpRead(editor)).toBe(true)
    expect(rsvpRead(viewer)).toBe(true)
  })

  it('an editor whose event-rsvps read is denied sees only bookings under its own address', () => {
    const denied = { ...editor, permissionOverrides: { deny: { 'event-rsvps': { read: true } } } }
    expect(rsvpRead(denied)).toEqual({ email: { equals: 'editor@example.com' } })
  })

  it('a customer is limited to their own address, so another person\'s booking is never returned', () => {
    const where = rsvpRead(customer) as { email: { equals: string } }
    expect(where).toEqual({ email: { equals: ANA } })
    const rows = [bookingFor(ANA), bookingFor(BEN)]
    const visible = rows.filter((row) => row.email === where.email.equals)
    expect(visible).toEqual([bookingFor(ANA)])
  })

  it('anonymous visitors and users with no address read nothing', () => {
    expect(rsvpRead(null)).toBe(false)
    expect(rsvpRead({ id: 4, roles: ['customer'] })).toBe(false)
  })

  it('a custom role limited to own items reads only its own address, never everyone', () => {
    const own = { id: 9, email: ANA, roles: ['customer'], customRolePermissions: { 'event-rsvps': { read: true, scope: 'own' } } }
    expect(resolveAccess(own, 'event-rsvps', 'read')).toBe('own')
    expect(isAdminOrRsvpOwner({ req: { user: own } } as never)).toEqual({ email: { equals: ANA } })
  })

  it('a custom role with event-rsvps read sees every booking', () => {
    const grant = { id: 9, email: 'x@example.com', roles: ['customer'], customRolePermissions: { 'event-rsvps': { read: true } } }
    expect(rsvpRead(grant)).toBe(true)
  })
})

describe('the entries export', () => {
  const exportAs = async (user: unknown) => {
    const handler = exportEndpoint.handler as unknown as (req: unknown) => Promise<Response>
    return handler({ user, url: 'http://localhost/api/form-submissions/export?form=4' })
  }

  it('refuses a customer, and an editor who can export but cannot read entries', async () => {
    expect((await exportAs(customer)).status).toBe(404)
    const exportOnly = {
      id: 5,
      roles: ['editor'],
      permissionOverrides: { deny: { 'form-submissions': { read: true } } },
    }
    expect((await exportAs(exportOnly)).status).toBe(404)
  })

  it('refuses a custom role that holds forms.export but not form-submissions read', async () => {
    const roleExport = { id: 6, roles: ['customer'], customRolePermissions: { 'forms.export': { read: true } } }
    expect((await exportAs(roleExport)).status).toBe(404)
  })
})
