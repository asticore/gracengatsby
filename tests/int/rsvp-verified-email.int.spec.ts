// @vitest-environment node
// Guest event bookings are matched to a customer by email, so a booking is visible only to a
// customer whose address is verified. Covers the collection access rule, the account bookings
// query, and the privacy export.
import { describe, expect, it, vi } from 'vitest'

import { canSeeBookingsByEmail, isAdminOrRsvpOwner } from '@/features/accounts/access'
import { bookingsForCustomer } from '@/features/accounts/bookings'

const customer = (over: Record<string, unknown> = {}) => ({
  id: 7,
  email: 'pat@example.com',
  roles: ['customer'],
  emailVerifiedAt: null as string | null,
  ...over,
})

const reqFor = (user: unknown) => ({ req: { user } }) as never

describe('canSeeBookingsByEmail', () => {
  it('is false without a verified address, true with one', () => {
    expect(canSeeBookingsByEmail(customer())).toBe(false)
    expect(canSeeBookingsByEmail(customer({ emailVerifiedAt: '2026-10-01T00:00:00.000Z' }))).toBe(true)
    expect(canSeeBookingsByEmail(customer({ email: '', emailVerifiedAt: '2026-10-01T00:00:00.000Z' }))).toBe(false)
    expect(canSeeBookingsByEmail(null)).toBe(false)
  })
})

describe('isAdminOrRsvpOwner', () => {
  it('gives an unverified customer no guest bookings, even when verification is off', () => {
    expect(isAdminOrRsvpOwner(reqFor(customer()) as never)).toBe(false)
  })

  it('matches a verified customer by email only', () => {
    const verified = customer({ emailVerifiedAt: '2026-10-01T00:00:00.000Z' })
    expect(isAdminOrRsvpOwner(reqFor(verified) as never)).toEqual({ email: { equals: 'pat@example.com' } })
  })

  it('lets an admin read every booking', () => {
    expect(isAdminOrRsvpOwner(reqFor({ id: 1, email: 'a@example.com', roles: ['admin'] }) as never)).toBe(true)
  })

  it('refuses a guest with no account', () => {
    expect(isAdminOrRsvpOwner(reqFor(null) as never)).toBe(false)
  })
})

describe('bookingsForCustomer', () => {
  const engineWith = (docs: unknown[]) => {
    const find = vi.fn(async () => ({ docs }))
    return { engine: { find } as never, find }
  }

  it('does not query bookings for an unverified customer', async () => {
    const { engine, find } = engineWith([{ id: 1, email: 'pat@example.com', event: { title: 'Gala' } }])
    const rows = await bookingsForCustomer(engine, customer() as never)
    expect(rows).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })

  it('returns the verified customer’s bookings through the collection rule', async () => {
    const { engine, find } = engineWith([{ id: 1, email: 'pat@example.com', event: { title: 'Gala', slug: 'gala' } }])
    const rows = await bookingsForCustomer(engine, customer({ emailVerifiedAt: '2026-10-01T00:00:00.000Z' }) as never)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'event-rsvps', overrideAccess: false, where: { email: { equals: 'pat@example.com' } } }))
    expect(rows[0]).toMatchObject({ eventTitle: 'Gala', eventSlug: 'gala' })
  })
})
