import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext, audit, getSecuritySettings } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  audit: vi.fn(async () => undefined),
  getSecuritySettings: vi.fn(async () => ({ featureEnabled: true })),
}))

vi.mock('@/admin/auth', () => ({
  getAdminContext,
  hasAdminPanelAccess: (user: { roles?: string[] } | null) => Array.isArray(user?.roles) && user.roles.length > 0,
}))

vi.mock('@/features/security/auditLog', () => ({
  audit,
  auditContext: () => ({ ip: '203.0.113.7', userAgent: 'test' }),
}))

vi.mock('@/features/security/settings', () => ({ getSecuritySettings }))

import {
  codeFromQuery,
  countByTier,
  countCheckIns,
  filterAttendees,
  matchesQuery,
  parseAttendee,
  parseAttendees,
  parseCheckInRequest,
  setCheckedIn,
  ticketCodeFor,
  type CheckInAttendee,
} from '@/features/editScreens/checkin'
import { GET, POST } from '@/app/(engage)/api/admin-event-checkin/route'

const AT = '2026-10-13T18:00:00.000Z'

const guest = (over: Partial<CheckInAttendee> & { id: number }): CheckInAttendee => ({
  name: `Guest ${over.id}`,
  email: `guest${over.id}@example.com`,
  guestCount: 1,
  ticketTier: '',
  checkedIn: false,
  checkedInAt: null,
  ...over,
})

const people = [
  guest({ id: 42, name: 'Ada Lovelace', email: 'ada@example.com', guestCount: 2 }),
  guest({ id: 7, name: 'Grace Hopper', email: 'grace@navy.example', guestCount: 1, checkedIn: true, checkedInAt: AT }),
  guest({ id: 130, name: 'Linus Torvalds', email: 'linus@kernel.example', guestCount: 3 }),
]

describe('parseAttendee', () => {
  it('keeps a well-formed row and drops one without a usable id', () => {
    expect(parseAttendee({ id: 5, name: 'Ann', email: 'a@x.example', guestCount: 2, checkedIn: 1, checkedInAt: AT })).toEqual({
      id: 5,
      name: 'Ann',
      email: 'a@x.example',
      guestCount: 2,
      ticketTier: '',
      checkedIn: true,
      checkedInAt: AT,
    })
    expect(parseAttendee({ name: 'No id' })).toBeNull()
    expect(parseAttendee(null)).toBeNull()
    expect(parseAttendees([{ id: 1, name: 'A' }, 'junk', { id: 0 }])).toHaveLength(1)
  })

  it('clears the check-in time for someone not checked in, and defaults the party to one', () => {
    const a = parseAttendee({ id: 3, checkedIn: false, checkedInAt: AT, guestCount: 0 })
    expect(a?.checkedInAt).toBeNull()
    expect(a?.guestCount).toBe(1)
  })
})

describe('search', () => {
  it('finds by name and email, ignoring case and extra spaces', () => {
    expect(filterAttendees(people, '  ADA ').map((p) => p.id)).toEqual([42])
    expect(filterAttendees(people, 'navy').map((p) => p.id)).toEqual([7])
    expect(filterAttendees(people, 'lovelace').map((p) => p.id)).toEqual([42])
  })

  it('finds by ticket code in any of the forms people say it', () => {
    expect(codeFromQuery('#00042')).toBe(42)
    expect(codeFromQuery('T-42')).toBe(42)
    expect(codeFromQuery('t42')).toBe(42)
    expect(codeFromQuery('42')).toBe(42)
    expect(codeFromQuery('0')).toBeNull()
    expect(codeFromQuery('ada')).toBeNull()
    expect(filterAttendees(people, '#130').map((p) => p.id)).toEqual([130])
    expect(filterAttendees(people, 'T-00007').map((p) => p.id)).toEqual([7])
    expect(ticketCodeFor(42)).toBe('#42')
  })

  it('returns everyone for an empty search and no one for a miss', () => {
    expect(filterAttendees(people, '   ')).toHaveLength(3)
    expect(filterAttendees(people, 'nobody here')).toHaveLength(0)
    expect(matchesQuery(people[0], '')).toBe(true)
  })
})

describe('setCheckedIn', () => {
  it('stamps the time when checking in and clears it when undone, without touching the rest or the input', () => {
    const before = people.slice()
    const checked = setCheckedIn(people, 42, true, AT)
    expect(checked.find((p) => p.id === 42)).toMatchObject({ checkedIn: true, checkedInAt: AT })
    expect(checked.find((p) => p.id === 130)).toBe(people[2])
    expect(people).toEqual(before)

    const undone = setCheckedIn(checked, 42, false, null)
    expect(undone.find((p) => p.id === 42)).toMatchObject({ checkedIn: false, checkedInAt: null })
  })
})

describe('countCheckIns', () => {
  it('counts RSVPs and guests, checked in and in total', () => {
    expect(countCheckIns(people)).toEqual({ checkedIn: 1, total: 3, guestsCheckedIn: 1, guestsTotal: 6 })
    expect(countCheckIns([])).toEqual({ checkedIn: 0, total: 0, guestsCheckedIn: 0, guestsTotal: 0 })
  })
})

describe('countByTier', () => {
  it('counts check-ins per ticket type, with a label for RSVPs that have none', () => {
    const tiered = [
      guest({ id: 1, ticketTier: 'VIP', checkedIn: true, checkedInAt: AT }),
      guest({ id: 2, ticketTier: 'Standard' }),
      guest({ id: 3, ticketTier: 'VIP' }),
      guest({ id: 4, ticketTier: '' }),
    ]
    expect(countByTier(tiered)).toEqual([
      { tier: 'VIP', checkedIn: 1, total: 2 },
      { tier: 'Standard', checkedIn: 0, total: 1 },
      { tier: 'No ticket type', checkedIn: 0, total: 1 },
    ])
  })

  it('reads ticketTier from a row and trims it', () => {
    expect(parseAttendee({ id: 9, ticketTier: '  Gold ' })?.ticketTier).toBe('Gold')
    expect(parseAttendee({ id: 9 })?.ticketTier).toBe('')
  })
})

describe('parseCheckInRequest', () => {
  it('accepts an id and a true or false flag', () => {
    expect(parseCheckInRequest({ rsvpId: 9, checkedIn: true })).toEqual({ ok: true, request: { rsvpId: 9, checkedIn: true } })
  })

  it('refuses a missing body, a bad id, or a flag that is not a real boolean', () => {
    expect(parseCheckInRequest(null).ok).toBe(false)
    expect(parseCheckInRequest({ rsvpId: 0, checkedIn: true }).ok).toBe(false)
    expect(parseCheckInRequest({ rsvpId: '9.5', checkedIn: true }).ok).toBe(false)
    expect(parseCheckInRequest({ rsvpId: 9, checkedIn: 'yes' }).ok).toBe(false)
  })
})

type Doc = Record<string, unknown>

const adminContext = (
  overrides: Partial<{ roles: string[]; isAdmin: boolean; collections: Record<string, { read?: boolean; update?: boolean }>; engine: unknown }> = {},
) => {
  const roles = overrides.roles ?? ['admin']
  return {
    user: { id: 1, email: 'staff@example.com', roles },
    isAdmin: overrides.isAdmin ?? roles.includes('admin'),
    permissions: {
      collections: overrides.collections ?? {
        events: { read: true, update: true },
        'event-rsvps': { read: true, update: true },
      },
    },
    engine: overrides.engine,
  }
}

const volunteerCollections = {
  events: { read: true, update: true },
  'event-rsvps': { read: true, update: false },
}

const engineWith = (rsvps: Doc[], event: Doc | null = { id: 3, title: 'Spring Gala' }) => {
  const find = vi.fn(async () => ({ docs: rsvps, hasNextPage: false }))
  const findByID = vi.fn(async (args: { collection: string; id: number }) => {
    if (args.collection === 'events') return event
    return rsvps.find((r) => r.id === args.id) ?? null
  })
  const update = vi.fn(async () => ({}))
  return { find, findByID, update }
}

const getRequest = (query: string) => new Request(`http://localhost/api/admin-event-checkin?${query}`)
const postRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/admin-event-checkin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('GET /api/admin-event-checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses no panel access, and a user who cannot manage RSVPs for the event', async () => {
    getAdminContext.mockResolvedValueOnce(adminContext({ roles: [] }))
    expect((await GET(getRequest('event=3'))).status).toBe(401)

    getAdminContext.mockResolvedValueOnce(
      adminContext({ roles: ['editor'], isAdmin: false, collections: { 'event-rsvps': { read: true }, events: { update: false } }, engine: engineWith([]) }),
    )
    expect((await GET(getRequest('event=3'))).status).toBe(403)
  })

  it('asks for an event id, and answers 404 for an unknown event', async () => {
    getAdminContext.mockResolvedValue(adminContext({ engine: engineWith([], null) }))
    expect((await GET(getRequest(''))).status).toBe(400)
    expect((await GET(getRequest('event=3'))).status).toBe(404)
  })

  it('returns only the fields the check-in screen needs', async () => {
    const rsvps = [
      { id: 1, event: 3, name: 'Ann', email: 'ann@example.com', guestCount: 2, ticketTier: 'VIP', notes: 'private note', checkedIn: true, checkedInAt: AT, createdAt: 'x' },
      { id: 2, event: 3, name: 'Ben', email: 'ben@example.com', guestCount: 1, ticketTier: '', notes: '', checkedIn: false, checkedInAt: null, createdAt: 'y' },
    ]
    getAdminContext.mockResolvedValue(adminContext({ engine: engineWith(rsvps) }))
    const response = await GET(getRequest('event=3'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { event: unknown; attendees: Array<Record<string, unknown>>; truncated: boolean }
    expect(body.event).toEqual({ id: 3, title: 'Spring Gala' })
    expect(body.truncated).toBe(false)
    expect(body.attendees).toEqual([
      { id: 1, name: 'Ann', email: 'ann@example.com', guestCount: 2, ticketTier: 'VIP', checkedIn: true, checkedInAt: AT },
      { id: 2, name: 'Ben', email: 'ben@example.com', guestCount: 1, ticketTier: '', checkedIn: false, checkedInAt: null },
    ])
    expect(JSON.stringify(body)).not.toContain('private note')
  })
})

describe('POST /api/admin-event-checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses a cross-site request before reading anything', async () => {
    getAdminContext.mockResolvedValue(adminContext({ engine: engineWith([]) }))
    const response = await POST(postRequest({ rsvpId: 1, checkedIn: true }, { origin: 'https://evil.example' }))
    expect(response.status).toBe(403)
    expect(getAdminContext).not.toHaveBeenCalled()
  })

  it('refuses a volunteer who can see RSVPs but may not change them', async () => {
    const engine = engineWith([{ id: 1, event: 3, checkedIn: false }])
    getAdminContext.mockResolvedValue(adminContext({ roles: ['volunteer'], isAdmin: false, collections: volunteerCollections, engine }))
    const response = await POST(postRequest({ rsvpId: 1, checkedIn: true }))
    expect(response.status).toBe(403)
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('rejects a bad body and an unknown guest', async () => {
    const engine = engineWith([])
    getAdminContext.mockResolvedValue(adminContext({ engine }))
    expect((await POST(postRequest('not json'))).status).toBe(400)
    expect((await POST(postRequest({ rsvpId: 1, checkedIn: 'yes' }))).status).toBe(400)
    expect((await POST(postRequest({ rsvpId: 99, checkedIn: true }))).status).toBe(404)
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('checks a guest in with a time, and records who did it', async () => {
    const engine = engineWith([{ id: 1, event: 3, checkedIn: false, checkedInAt: null }])
    getAdminContext.mockResolvedValue(adminContext({ engine }))
    const response = await POST(postRequest({ rsvpId: 1, checkedIn: true }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { checkedIn: boolean; checkedInAt: string; changed: boolean }
    expect(body).toMatchObject({ checkedIn: true, changed: true })
    expect(Number.isNaN(new Date(body.checkedInAt).getTime())).toBe(false)
    expect(engine.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'event-rsvps', id: 1, data: { checkedIn: true, checkedInAt: body.checkedInAt } }),
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', collectionSlug: 'event-rsvps', documentId: 1, actorId: 1, actorEmail: 'staff@example.com' }),
      expect.anything(),
    )
  })

  it('undoing clears the time', async () => {
    const engine = engineWith([{ id: 1, event: 3, checkedIn: true, checkedInAt: AT }])
    getAdminContext.mockResolvedValue(adminContext({ engine }))
    const response = await POST(postRequest({ rsvpId: 1, checkedIn: false }))
    expect(await response.json()).toMatchObject({ checkedIn: false, checkedInAt: null, changed: true })
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { checkedIn: false, checkedInAt: null } }))
  })

  it('is idempotent: asking for the state already set writes and audits nothing', async () => {
    const engine = engineWith([{ id: 1, event: 3, checkedIn: true, checkedInAt: AT }])
    getAdminContext.mockResolvedValue(adminContext({ engine }))
    const response = await POST(postRequest({ rsvpId: 1, checkedIn: true }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ checkedIn: true, checkedInAt: AT, changed: false })
    expect(engine.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('still saves when the audit trail fails', async () => {
    audit.mockRejectedValueOnce(new Error('D1 down'))
    const engine = engineWith([{ id: 1, event: 3, checkedIn: false, checkedInAt: null }])
    getAdminContext.mockResolvedValue(adminContext({ engine }))
    const response = await POST(postRequest({ rsvpId: 1, checkedIn: true }))
    expect(response.status).toBe(200)
    expect(engine.update).toHaveBeenCalledTimes(1)
  })
})
