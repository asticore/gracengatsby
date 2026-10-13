import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({ getAdminContext: vi.fn() }))

vi.mock('@/admin/auth', () => ({
  getAdminContext,
  hasAdminPanelAccess: (user: { roles?: string[] } | null) => Array.isArray(user?.roles) && user.roles.length > 0,
}))

import { GET as rsvpGET } from '@/app/(engage)/api/admin-event-rsvps/route'
import { GET as submissionsGET } from '@/app/(engage)/api/admin-form-submissions/route'

type Doc = Record<string, unknown>

type EventBody = {
  docs: Array<Record<string, unknown>>
  totalDocs: number
  totalPages: number
  hasNextPage: boolean
  totalGuests: number
  guestsTruncated: boolean
}

type FormBody = {
  columns: Array<{ name: string; label: string }>
  docs: Array<Record<string, unknown>>
  totalDocs: number
}

/** A find() stand-in that pages a fixed list the way the engine does. */
const pagedFind = (docs: Doc[]) =>
  vi.fn(async (args: { page?: number; limit?: number }) => {
    const page = args.page ?? 1
    const limit = args.limit ?? docs.length
    const slice = docs.slice((page - 1) * limit, page * limit)
    return { docs: slice, totalDocs: docs.length, hasNextPage: page * limit < docs.length }
  })

const adminContext = (
  overrides: Partial<{ roles: string[]; collections: Record<string, { read?: boolean; update?: boolean }>; engine: unknown }> = {},
) => {
  const roles = overrides.roles ?? ['admin']
  return {
    user: { roles },
    isAdmin: roles.includes('admin'),
    permissions: {
      collections: overrides.collections ?? {
        'event-rsvps': { read: true },
        'form-submissions': { read: true },
        events: { read: true, update: true },
      },
    },
    engine: overrides.engine,
  }
}

const rsvp = (n: number, extra: Doc = {}): Doc => ({
  id: n,
  name: `Guest ${n}`,
  email: `guest${n}@example.com`,
  guestCount: 1,
  notes: '',
  createdAt: `2026-10-${String(Math.min(n, 28)).padStart(2, '0')}T09:00:00.000Z`,
  ...extra,
})

const eventRequest = (query: string) => new Request(`http://localhost/api/admin-event-rsvps?${query}`)
const formRequest = (query: string) => new Request(`http://localhost/api/admin-form-submissions?${query}`)

describe('GET /api/admin-event-rsvps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses a user without admin panel access', async () => {
    getAdminContext.mockResolvedValue(adminContext({ roles: [] }))
    const response = await rsvpGET(eventRequest('event=3'))
    expect(response.status).toBe(401)
  })

  it('refuses a user who cannot read RSVPs', async () => {
    getAdminContext.mockResolvedValue(adminContext({ roles: ['editor'], collections: {} }))
    const response = await rsvpGET(eventRequest('event=3'))
    expect(response.status).toBe(403)
  })

  it('refuses a non-admin who owns one RSVP but cannot update the event, even with RSVP read', async () => {
    const find = pagedFind([rsvp(1)])
    getAdminContext.mockResolvedValue(
      adminContext({
        roles: ['editor'],
        collections: { 'event-rsvps': { read: true }, events: { read: true, update: false } },
        engine: { find, findByID: vi.fn(async () => ({ id: 3, title: 'Gala' })) },
      }),
    )
    const response = await rsvpGET(eventRequest('event=3'))
    expect(response.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
    const csv = await rsvpGET(eventRequest('event=3&format=csv'))
    expect(csv.status).toBe(403)
  })

  it('answers a non-admin who can update the event', async () => {
    getAdminContext.mockResolvedValue(
      adminContext({
        roles: ['editor'],
        collections: { 'event-rsvps': { read: true }, events: { read: true, update: true } },
        engine: { find: pagedFind([rsvp(1)]), findByID: vi.fn(async () => ({ id: 3, title: 'Gala' })) },
      }),
    )
    expect((await rsvpGET(eventRequest('event=3'))).status).toBe(200)
  })

  it('asks for an event id', async () => {
    getAdminContext.mockResolvedValue(adminContext({ engine: { find: vi.fn(), findByID: vi.fn() } }))
    const response = await rsvpGET(eventRequest(''))
    expect(response.status).toBe(400)
  })

  it('returns 404 for an event that does not exist', async () => {
    getAdminContext.mockResolvedValue(
      adminContext({ engine: { find: vi.fn(), findByID: vi.fn(async () => null) } }),
    )
    const response = await rsvpGET(eventRequest('event=999'))
    expect(response.status).toBe(404)
  })

  it('returns one page of RSVPs with counts, newest first', async () => {
    const docs = Array.from({ length: 30 }, (_, i) => rsvp(i + 1, { guestCount: 2 }))
    const find = pagedFind(docs)
    getAdminContext.mockResolvedValue(
      adminContext({ engine: { find, findByID: vi.fn(async () => ({ id: 3, title: 'Gala' })) } }),
    )

    const response = await rsvpGET(eventRequest('event=3&page=1'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as EventBody
    expect(body.docs).toHaveLength(25)
    expect(body.totalDocs).toBe(30)
    expect(body.totalPages).toBe(2)
    expect(body.hasNextPage).toBe(true)
    expect(body.totalGuests).toBe(60)
    expect(body.guestsTruncated).toBe(false)
    expect(body.docs[0]).toMatchObject({ id: 1, name: 'Guest 1', email: 'guest1@example.com', guestCount: 2 })

    const firstCall = find.mock.calls[0][0] as { collection: string; where: unknown; sort: string; user: unknown }
    expect(firstCall.collection).toBe('event-rsvps')
    expect(firstCall.where).toEqual({ event: { equals: 3 } })
    expect(firstCall.sort).toBe('-createdAt')
    expect(firstCall.user).toEqual({ roles: ['admin'] })
  })

  it('exports a CSV with the event title in the filename and formula text neutralised', async () => {
    const docs = [
      rsvp(1, { name: '=HYPERLINK("x")', notes: 'bring a, friend' }),
      rsvp(2, { name: 'Plain' }),
    ]
    getAdminContext.mockResolvedValue(
      adminContext({
        engine: { find: pagedFind(docs), findByID: vi.fn(async () => ({ id: 3, title: 'Spring Gala' })) },
      }),
    )

    const response = await rsvpGET(eventRequest('event=3&format=csv'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="spring-gala-rsvps-\d{4}-\d{2}-\d{2}\.csv"$/)
    // Response.text() drops a leading BOM, so read the bytes and keep it.
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(body).toContain('"\t=HYPERLINK(""x"")"')
    expect(body).toContain('"bring a, friend"')
    expect(body).toContain('Plain')
    expect(body.split('\r\n')[0]).toBe(String.fromCharCode(0xfeff) + 'Entry ID,Name,Email,Guests,Ticket,Notes,Registered')
  })
})

describe('GET /api/admin-form-submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const form = {
    id: 5,
    title: 'Contact',
    fields: [
      { type: 'text', name: 'name', label: 'Your name' },
      { type: 'section', label: 'More' },
      { type: 'select', name: 'topic', label: 'Topic' },
    ],
  }

  it('refuses a user who cannot read submissions', async () => {
    getAdminContext.mockResolvedValue(adminContext({ collections: { 'form-submissions': { read: false } } }))
    const response = await submissionsGET(formRequest('form=5'))
    expect(response.status).toBe(403)
  })

  it('returns 404 for a form that does not exist', async () => {
    getAdminContext.mockResolvedValue(adminContext({ engine: { find: vi.fn(), findByID: vi.fn(async () => null) } }))
    const response = await submissionsGET(formRequest('form=77'))
    expect(response.status).toBe(404)
  })

  it('returns the form columns and only those answers, newest first', async () => {
    const submissions = [
      { id: 2, values: { name: 'Ada', topic: 'Tickets', ip: '10.0.0.2' }, createdAt: '2026-10-05', paymentStatus: 'none' },
      { id: 1, values: { name: 'Grace', topic: 'Venue' }, createdAt: '2026-10-01', paymentStatus: 'none' },
    ]
    const find = pagedFind(submissions)
    getAdminContext.mockResolvedValue(
      adminContext({ engine: { find, findByID: vi.fn(async () => form) } }),
    )

    const response = await submissionsGET(formRequest('form=5'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as FormBody
    expect(body.columns).toEqual([
      { name: 'name', label: 'Your name' },
      { name: 'topic', label: 'Topic' },
    ])
    expect(body.docs[0]).toEqual({
      id: 2,
      submittedAt: '2026-10-05',
      total: null,
      paymentStatus: 'none',
      values: { name: 'Ada', topic: 'Tickets' },
    })
    expect(body.totalDocs).toBe(2)
    expect((find.mock.calls[0][0] as { where: unknown }).where).toEqual({ form: { equals: 5 } })
  })
})

describe('across every event and every form (all=1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists RSVPs of every event with the event title, filtered by event, search and dates', async () => {
    const find = pagedFind([rsvp(1, { event: { id: 3, title: 'Gala' } }), rsvp(2, { event: 4 })])
    getAdminContext.mockResolvedValue(adminContext({ engine: { find } }))
    const response = await rsvpGET(eventRequest('all=1&event=3&q=ada&from=2026-10-01&to=2026-10-31'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { docs: Array<Record<string, unknown>>; totalDocs: number }
    expect(body.docs[0]).toMatchObject({ eventId: 3, eventTitle: 'Gala' })
    expect(body.docs[1]).toMatchObject({ eventId: 4, eventTitle: 'Event #4' })
    const call = find.mock.calls[0][0] as { where: { and: unknown[] }; depth: number }
    expect(call.depth).toBe(1)
    expect(call.where.and).toHaveLength(4)
  })

  it('still needs event update rights for the all-RSVPs list', async () => {
    getAdminContext.mockResolvedValue(
      adminContext({ roles: ['editor'], collections: { 'event-rsvps': { read: true }, events: { read: true, update: false } }, engine: { find: vi.fn() } }),
    )
    expect((await rsvpGET(eventRequest('all=1'))).status).toBe(403)
    expect((await rsvpGET(eventRequest('all=1&format=csv'))).status).toBe(403)
  })

  it('exports the filtered RSVPs as CSV', async () => {
    getAdminContext.mockResolvedValue(adminContext({ engine: { find: pagedFind([rsvp(1, { event: { id: 3, title: 'Gala' } })]) } }))
    const response = await rsvpGET(eventRequest('all=1&format=csv'))
    expect(response.headers.get('Content-Disposition')).toMatch(/all-rsvps-\d{4}-\d{2}-\d{2}\.csv/)
    const text = new TextDecoder().decode(await response.arrayBuffer())
    expect(text).toContain('Gala')
  })

  it('lists submissions of every form with the form title and filters', async () => {
    const find = pagedFind([{ id: 1, form: { id: 5, title: 'Contact' }, summary: 'Ada', createdAt: '2026-10-02', paymentStatus: 'paid' }])
    getAdminContext.mockResolvedValue(adminContext({ engine: { find } }))
    const response = await submissionsGET(formRequest('all=1&status=paid&q=ada'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { docs: Array<Record<string, unknown>> }
    expect(body.docs[0]).toMatchObject({ formId: 5, formTitle: 'Contact', summary: 'Ada', paymentStatus: 'paid' })
    expect((find.mock.calls[0][0] as { where: unknown }).where).toEqual({
      and: [{ paymentStatus: { equals: 'paid' } }, { summary: { contains: 'ada' } }],
    })
  })

  it('refuses the all-submissions list without read permission', async () => {
    getAdminContext.mockResolvedValue(adminContext({ collections: { 'form-submissions': { read: false } } }))
    expect((await submissionsGET(formRequest('all=1'))).status).toBe(403)
  })

  it('exports the filtered submissions as CSV', async () => {
    const find = pagedFind([{ id: 1, form: { id: 5, title: 'Contact' }, summary: '=1+1', createdAt: '2026-10-02' }])
    getAdminContext.mockResolvedValue(adminContext({ engine: { find } }))
    const response = await submissionsGET(formRequest('all=1&format=csv'))
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    const text = new TextDecoder().decode(await response.arrayBuffer())
    expect(text).toContain('Contact')
    expect(text).toContain('\t=1+1')
  })
})
