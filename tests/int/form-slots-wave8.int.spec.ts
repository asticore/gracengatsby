// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// No D1 binding in tests: bookings are read through the engine, which is the path under test.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => {
    throw new Error('no cloudflare context in tests')
  },
}))

import { handleSubmission, type SubmitEngine } from '@/features/forms/submit'
import { handleSlotsRequest } from '@/features/forms/slotsEndpoint'
import { isSlotTaken, normaliseSlotDate, normaliseSlotTime, slotCapacity, slotKey, slotKeyFromValue, SLOT_TAKEN_MESSAGE, takenTimesOn } from '@/features/forms/slots'
import { resetRateLimiter } from '@/features/security/rateLimit'
import type { FormDoc } from '@/features/forms/types'

type Row = Record<string, unknown>

const NOW = new Date('2026-10-13T08:00:00Z')

/** The builder stores layout nodes; the appointment settings live in their props. */
function layoutFor(capacity?: number): Row[] {
  return [
    {
      blockType: 'element',
      _id: 'visit',
      elementType: 'ff-appointment',
      props: {
        name: 'visit',
        label: 'Visit',
        required: true,
        slotsText: '09:00, 10:00, 11:00',
        weekdaysText: '0,1,2,3,4,5,6',
        daysAhead: 400,
        ...(capacity === undefined ? {} : { capacity }),
      },
    },
    { blockType: 'element', _id: 'name', elementType: 'ff-text', props: { name: 'name', label: 'Name' } },
  ]
}

function formDoc(capacity?: number, extra: Partial<FormDoc> = {}): FormDoc {
  return { id: 5, key: 'bookabc12345', title: 'Book a visit', formStatus: 'published', publishedLayout: layoutFor(capacity), ...extra } as unknown as FormDoc
}

/** A small store answering what the submit path and the availability endpoint call. */
function fakeEngine(initial: Row[] = []) {
  const rows: Row[] = initial.map((row) => ({ ...row }))
  const deleted: unknown[] = []
  let nextId = Math.max(0, ...rows.map((row) => Number(row.id) || 0)) + 1
  const matches = (row: Row, where: Record<string, unknown>): boolean => {
    const and = (where.and as Record<string, Record<string, unknown>>[]) || []
    return and.every((clause) => {
      if ('form' in clause) return row.form === (clause.form as Record<string, unknown>).equals
      if ('status' in clause) {
        const status = clause.status as Record<string, unknown>
        return 'not_equals' in status ? row.status !== status.not_equals : row.status === status.equals
      }
      return true
    })
  }
  const engine = {
    rows,
    deleted,
    creates: 0,
    /** Runs once after the next insert: lets a test put a racing booking in place. */
    afterCreate: null as null | ((self: { rows: Row[] }) => void),
    logger: { info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined },
    findGlobal: async ({ slug }: { slug: string }) => (slug === 'site-settings' ? { features: { forms: true } } : {}),
    findByID: async ({ id }: { id: number }) => (id === 5 ? formDoc() : null),
    find: async (args: { where?: Record<string, unknown> }) => ({ docs: rows.filter((row) => matches(row, args.where || {})) }),
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId++, ...data }
      rows.push(row)
      engine.creates += 1
      engine.afterCreate?.(engine)
      return { id: row.id }
    },
    update: async () => ({}),
    delete: async ({ id }: { id: number }) => {
      deleted.push(id)
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
      return {}
    },
  }
  return engine
}

const booking = (id: number, slot: string, extra: Row = {}): Row => ({ id, form: 5, status: 'new', values: { visit: slot, name: `Guest ${id}` }, ...extra })

const submission = (visit: string, capacity?: number) => ({
  formID: 5,
  form: formDoc(capacity),
  values: { visit, name: 'Ada' },
  renderedAt: NOW.getTime() - 20_000,
  now: NOW,
})

describe('slot keys and capacity', () => {
  it('normalises a date and a time into one comparison key', () => {
    expect(normaliseSlotDate('2026-10-14')).toBe('2026-10-14')
    expect(normaliseSlotDate('2026-02-30')).toBeNull()
    expect(normaliseSlotDate('14/10/2026')).toBeNull()
    expect(normaliseSlotTime('9:30')).toBe('09:30')
    expect(normaliseSlotTime('24:00')).toBeNull()
    expect(slotKey('2026-10-14', '9:30')).toBe('2026-10-14 09:30')
    expect(slotKey('2026-10-14', 'soon')).toBeNull()
  })

  it('reads a stored answer back to the same key', () => {
    expect(slotKeyFromValue('2026-10-14 09:30')).toBe('2026-10-14 09:30')
    expect(slotKeyFromValue('2026-10-14T09:30')).toBe('2026-10-14 09:30')
    expect(slotKeyFromValue('not a slot')).toBeNull()
    expect(slotKeyFromValue(undefined)).toBeNull()
  })

  it('clamps capacity and defaults it to one', () => {
    expect(slotCapacity(undefined)).toBe(1)
    expect(slotCapacity('abc')).toBe(1)
    expect(slotCapacity(0)).toBe(1)
    expect(slotCapacity(3.7)).toBe(3)
    expect(slotCapacity(500)).toBe(50)
    expect(slotCapacity('2')).toBe(2)
  })

  it('says a slot is taken when it holds capacity bookings', () => {
    const keys = ['2026-10-14 09:00', '2026-10-14 09:00', '2026-10-14 10:00']
    expect(isSlotTaken(keys, '2026-10-14 09:00')).toBe(true)
    expect(isSlotTaken(keys, '2026-10-14 10:00')).toBe(true)
    expect(isSlotTaken(keys, '2026-10-14 11:00')).toBe(false)
    expect(isSlotTaken(keys, '2026-10-14 09:00', 3)).toBe(false)
    expect(isSlotTaken(keys, '2026-10-14 09:00', 2)).toBe(true)
  })

  it('lists the full start times on one day only', () => {
    const keys = ['2026-10-14 09:00', '2026-10-14 10:00', '2026-10-14 10:00', '2026-10-15 09:00']
    expect(takenTimesOn(keys, '2026-10-14')).toEqual(['09:00', '10:00'])
    expect(takenTimesOn(keys, '2026-10-14', 2)).toEqual(['10:00'])
    expect(takenTimesOn(keys, '2026-10-16')).toEqual([])
  })
})

describe('double-booking rule in the submit pipeline', { timeout: 30_000 }, () => {
  beforeEach(() => resetRateLimiter())

  it('accepts the first booking of a slot and refuses the second', async () => {
    const engine = fakeEngine()
    const first = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 09:00'))
    expect(first.ok).toBe(true)
    expect(engine.rows).toHaveLength(1)

    const second = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 09:00'))
    expect(second.ok).toBe(false)
    expect(second.status).toBe(400)
    expect(second.errors).toEqual({ visit: SLOT_TAKEN_MESSAGE })
    expect(engine.creates).toBe(1)
  })

  it('leaves other times on the same day open', async () => {
    const engine = fakeEngine([booking(1, '2026-10-14 09:00')])
    const result = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 10:00'))
    expect(result.ok).toBe(true)
  })

  it('allows as many bookings as the capacity says', async () => {
    const engine = fakeEngine([booking(1, '2026-10-14 09:00')])
    const second = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 09:00', 2))
    expect(second.ok).toBe(true)
    const third = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 09:00', 2))
    expect(third.ok).toBe(false)
    expect(third.errors).toEqual({ visit: SLOT_TAKEN_MESSAGE })
  })

  it('does not count spam as a booking', async () => {
    const engine = fakeEngine([booking(1, '2026-10-14 09:00', { status: 'spam' })])
    const result = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 09:00'))
    expect(result.ok).toBe(true)
  })

  it('takes its own entry back when a racing request was saved first', async () => {
    const engine = fakeEngine()
    // Our check passes; then a racer's entry with a lower id lands on the same slot before our re-check.
    engine.afterCreate = (self) => {
      self.rows.unshift({ id: 0, form: 5, status: 'new', values: { visit: '2026-10-14 09:00' } })
    }
    const result = await handleSubmission(engine as unknown as SubmitEngine, submission('2026-10-14 09:00'))
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual({ visit: SLOT_TAKEN_MESSAGE })
    expect(engine.deleted).toEqual([1])
    expect(engine.rows.map((row) => row.id)).toEqual([0])
  })
})

describe('GET /api/form-slots', { timeout: 30_000 }, () => {
  beforeEach(() => resetRateLimiter())

  const request = (query: string, ip: string) => new Request(`https://example.test/api/form-slots?${query}`, { headers: { 'cf-connecting-ip': ip } })

  it('answers with the full start times only, never cached', async () => {
    const engine = fakeEngine([booking(1, '2026-10-14 09:00', { values: { visit: '2026-10-14 09:00', name: 'Secret Person', email: 'x@example.com' } })])
    const response = await handleSlotsRequest(request('form=5&field=visit&date=2026-10-14', '203.0.113.20'), engine as never)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true, date: '2026-10-14', taken: ['09:00'] })
    expect(JSON.stringify(body)).not.toMatch(/Secret|example/)
  })

  it('refuses a bad date, an unknown field and an unknown form', async () => {
    const engine = fakeEngine()
    expect((await handleSlotsRequest(request('form=5&field=visit&date=nope', '203.0.113.21'), engine as never)).status).toBe(400)
    expect((await handleSlotsRequest(request('form=5&field=name&date=2026-10-14', '203.0.113.22'), engine as never)).status).toBe(404)
    expect((await handleSlotsRequest(request('form=6&field=visit&date=2026-10-14', '203.0.113.23'), engine as never)).status).toBe(404)
  })

  it('is rate limited per client', async () => {
    const engine = fakeEngine()
    let last = 200
    for (let i = 0; i < 61; i++) {
      last = (await handleSlotsRequest(request('form=5&field=visit&date=2026-10-14', '203.0.113.30'), engine as never)).status
    }
    expect(last).toBe(429)
  })
})
