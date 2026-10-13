// Wave 10: repeat rules (expansion, RRULE, generator planning) and ticket type sales.
// Pure logic only: no database, no engine.
import { describe, expect, it } from 'vitest'

import { icsFromEvent } from '@/features/editScreens/ics'
import { buildRRule, expandRecurrence, parseRecurrence, parseWeekdays, rruleFromRecurrence, type RecurrenceRule } from '@/features/editScreens/recurrence'
import { childSlug, planOccurrences, type GenerateParent } from '@/features/editScreens/recurrenceGenerate'
import { EVENT_TIME_ZONE, localDateIn, wallTimeIn, zonedToUtc } from '@/features/editScreens/timeZone'
import { parseTiers, type TicketTier } from '@/features/editScreens/tiers'
import { guestsByTier, tierOptionLabel, tierRoomError, tierViews } from '@/features/editScreens/tierSales'

// Sydney local time to an instant.
const at = (year: number, month: number, day: number, hour = 9, minute = 0): Date =>
  zonedToUtc({ year, month, day, hour, minute }, EVENT_TIME_ZONE)

const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'weekly',
  interval: 1,
  weekdays: [],
  monthlyBy: 'dayOfMonth',
  until: null,
  count: null,
  skipDates: [],
  ...overrides,
})

const dates = (result: { occurrences: { date: string }[] }): string[] => result.occurrences.map((o) => o.date)

describe('time zone handling', () => {
  it('turns Sydney wall time into the right instant on both sides of daylight saving', () => {
    // 4 October 2026 is when Sydney starts AEDT (+11). 9am before is AEST (+10), after is AEDT.
    expect(at(2026, 10, 3).toISOString()).toBe('2026-10-02T23:00:00.000Z')
    expect(at(2026, 10, 5).toISOString()).toBe('2026-10-04T22:00:00.000Z')
  })

  it('reads the wall clock back from an instant', () => {
    const wall = wallTimeIn(at(2026, 10, 20, 18, 30), EVENT_TIME_ZONE)
    expect(wall).toEqual({ year: 2026, month: 10, day: 20, hour: 18, minute: 30 })
    expect(localDateIn(at(2026, 10, 20, 0, 30), EVENT_TIME_ZONE)).toBe('2026-10-20')
  })
})

describe('expandRecurrence', () => {
  it('repeats weekly on the chosen weekdays until the stop date', () => {
    // Wed 7 October 2026 start; Mon and Wed; stop after Tue 20 October.
    const result = expandRecurrence({
      start: at(2026, 10, 7),
      end: null,
      rule: rule({ weekdays: [1, 3], until: { year: 2026, month: 10, day: 20 } }),
    })
    expect(dates(result)).toEqual(['2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19'])
    expect(result.truncated).toBe(false)
  })

  it('keeps the wall-clock time across a daylight saving change', () => {
    const result = expandRecurrence({ start: at(2026, 10, 1), end: null, rule: rule({ count: 3 }) })
    for (const occurrence of result.occurrences) {
      expect(wallTimeIn(occurrence.start, EVENT_TIME_ZONE).hour).toBe(9)
    }
    expect(result.occurrences[1].start.toISOString()).toBe(at(2026, 10, 8).toISOString())
  })

  it('keeps the same length for each occurrence end', () => {
    const result = expandRecurrence({
      start: at(2026, 10, 13, 18),
      end: at(2026, 10, 13, 20),
      rule: rule({ count: 3 }),
    })
    for (const occurrence of result.occurrences) {
      expect(occurrence.end!.getTime() - occurrence.start.getTime()).toBe(2 * 60 * 60 * 1000)
    }
  })

  it('repeats every other day, leaves out skipped dates and counts the dates that happen', () => {
    const result = expandRecurrence({
      start: at(2026, 10, 1),
      end: null,
      rule: rule({ frequency: 'daily', interval: 2, count: 3, skipDates: ['2026-10-03'] }),
    })
    expect(dates(result)).toEqual(['2026-10-01', '2026-10-05', '2026-10-07'])
    expect(result.truncated).toBe(true)
  })

  it('repeats on the same day of the month and skips months that have no such day', () => {
    const result = expandRecurrence({
      start: at(2026, 1, 31),
      end: null,
      rule: rule({ frequency: 'monthly', until: { year: 2026, month: 6, day: 30 } }),
    })
    expect(dates(result)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })

  it('repeats on the nth weekday of each month', () => {
    // Tuesday 13 October 2026 is the second Tuesday of the month.
    const result = expandRecurrence({
      start: at(2026, 10, 13),
      end: null,
      rule: rule({ frequency: 'monthly', monthlyBy: 'nthWeekday', count: 3 }),
    })
    expect(dates(result)).toEqual(['2026-10-13', '2026-11-10', '2026-12-08'])
  })

  it('stops at 52 dates and says it was cut short', () => {
    const result = expandRecurrence({
      start: at(2026, 10, 1),
      end: null,
      rule: rule({ frequency: 'daily', until: { year: 2030, month: 1, day: 1 } }),
    })
    expect(result.occurrences).toHaveLength(52)
    expect(result.truncated).toBe(true)
  })

  it('defaults to a year from the first date when no stop date is set', () => {
    const result = expandRecurrence({ start: at(2026, 10, 1), end: null, rule: rule({ frequency: 'monthly' }) })
    expect(dates(result)).toEqual([
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
      '2027-07-01',
      '2027-08-01',
      '2027-09-01',
      '2027-10-01',
    ])
  })
})

describe('parseRecurrence and parseWeekdays', () => {
  it('returns null for an event that does not repeat or has an unknown frequency', () => {
    expect(parseRecurrence({ frequency: 'none' })).toBeNull()
    expect(parseRecurrence(undefined)).toBeNull()
    expect(parseRecurrence({ frequency: 'yearly' })).toBeNull()
  })

  it('reads names, abbreviations and numbers for weekdays', () => {
    expect(parseWeekdays('Wednesday, mon  Fri')).toEqual([1, 3, 5])
    expect(parseWeekdays([0, 9, 'Sat', 'xx'])).toEqual([0, 6])
  })

  it('reads a stored group with skipped dates one per line and a timestamp stop date', () => {
    const parsed = parseRecurrence({
      frequency: 'weekly',
      interval: '2',
      weekdays: 'Tue',
      until: '2026-12-31T13:00:00.000Z',
      count: '',
      exceptions: '2026-10-20\nnot a date\n2026-10-20',
    })
    expect(parsed).toMatchObject({ frequency: 'weekly', interval: 2, weekdays: [2], count: null, skipDates: ['2026-10-20'] })
    // 13:00 UTC on 31 December is 00:00 on 1 January in Sydney.
    expect(parsed?.until).toEqual({ year: 2027, month: 1, day: 1 })
  })
})

describe('RRULE', () => {
  it('writes FREQ, INTERVAL, BYDAY and COUNT', () => {
    expect(buildRRule(rule({ weekdays: [1, 3], count: 4 }), at(2026, 10, 7))).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=4')
  })

  it('writes the nth weekday for a monthly repeat', () => {
    expect(buildRRule(rule({ frequency: 'monthly', monthlyBy: 'nthWeekday', count: 3 }), at(2026, 10, 13))).toBe(
      'FREQ=MONTHLY;INTERVAL=1;BYDAY=2TU;COUNT=3',
    )
  })

  it('writes UNTIL in UTC at the end of the stop day when there is no count', () => {
    const line = buildRRule(rule({ frequency: 'daily', interval: 2, until: { year: 2026, month: 10, day: 20 } }), at(2026, 10, 1))
    expect(line).toBe('FREQ=DAILY;INTERVAL=2;UNTIL=20261020T125900Z')
  })

  it('is null for an event that does not repeat, and the ics feed carries it for one that does', () => {
    expect(rruleFromRecurrence({ frequency: 'none' }, at(2026, 10, 1))).toBeNull()
    const ics = icsFromEvent(
      {
        id: 7,
        slug: 'styling-night',
        title: 'Styling night',
        startDate: at(2026, 10, 13, 18).toISOString(),
        endDate: at(2026, 10, 13, 20).toISOString(),
        recurrence: { frequency: 'weekly', interval: 1, weekdays: 'Tue', count: 4 },
      },
      'https://example.com',
    )
    const unfolded = ics!.replace(/\r\n /g, '')
    expect(unfolded).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=4')
  })
})

describe('planOccurrences', () => {
  const parent: GenerateParent = {
    id: 42,
    title: 'Styling night',
    slug: 'Styling Night!',
    startDate: at(2026, 10, 13, 18).toISOString(),
    endDate: at(2026, 10, 13, 20).toISOString(),
    description: { root: {} },
    coverImage: { id: 9, url: '/media/x.jpg' },
    location: { venueName: 'The Hall', address: '1 Main St', isOnline: false },
    eventType: 'free',
    capacity: 30,
    ticketTiers: [{ name: 'Standard', description: '', price: 0, capacity: 20, salesEnd: null }],
  }

  it('creates the dates that do not exist yet and skips the rest', () => {
    const plan = planOccurrences({
      parent,
      rule: rule({ count: 4 }),
      existingDates: new Set(['2026-10-20']),
      takenSlugs: new Set(['styling-night-2026-10-27']),
    })
    expect(plan.create.map((item) => item.date)).toEqual(['2026-11-03'])
    expect(plan.skipped).toBe(2)
    const [child] = plan.create
    expect(child.slug).toBe('styling-night-2026-11-03')
    expect(child.data).toMatchObject({
      title: 'Styling night',
      seriesOf: 42,
      _status: 'draft',
      coverImage: 9,
      eventType: 'free',
      capacity: 30,
      ticketTiers: [{ name: 'Standard', description: '', price: 0, capacity: 20, salesEnd: null }],
      location: { venueName: 'The Hall', address: '1 Main St', isOnline: false },
    })
  })

  it('creates nothing the second time round', () => {
    const first = planOccurrences({ parent, rule: rule({ count: 4 }), existingDates: new Set(), takenSlugs: new Set() })
    expect(first.create).toHaveLength(3)
    const existing = new Set(first.create.map((item) => item.date))
    const second = planOccurrences({ parent, rule: rule({ count: 4 }), existingDates: existing, takenSlugs: new Set() })
    expect(second.create).toHaveLength(0)
    expect(second.skipped).toBe(3)
  })

  it('builds slugs from the parent slug and the date', () => {
    expect(childSlug('Styling Night!', '2026-10-20')).toBe('styling-night-2026-10-20')
    expect(childSlug('', '2026-10-20')).toBe('event-2026-10-20')
  })
})

describe('ticket tiers and sales', () => {
  const vip: TicketTier = { name: 'VIP', description: 'Front row', price: 25, capacity: 10, salesEnd: null }
  const general: TicketTier = { name: 'General', description: '', price: 0, capacity: null, salesEnd: null }

  it('counts guests per tier and ignores rows with no tier', () => {
    const totals = guestsByTier([
      { ticketTier: 'VIP', guestCount: 3 },
      { ticketTier: 'VIP' },
      { ticketTier: 'General', guestCount: '2' },
      { ticketTier: null, guestCount: 5 },
    ])
    expect(totals.get('VIP')).toBe(4)
    expect(totals.get('General')).toBe(2)
    expect(totals.size).toBe(2)
  })

  it('shows what is left and whether a tier is sold out', () => {
    const views = tierViews([vip, general], [{ ticketTier: 'VIP', guestCount: 10 }], new Date('2026-10-13T00:00:00Z'))
    expect(views[0]).toMatchObject({ name: 'VIP', remaining: 0, soldOut: true, priceLabel: '$25.00' })
    expect(views[1]).toMatchObject({ name: 'General', remaining: null, soldOut: false, priceLabel: 'Free' })
    expect(tierOptionLabel(views[0])).toBe('VIP - $25.00 - sold out')
    expect(tierOptionLabel(views[1])).toBe('General - Free')
  })

  it('marks a tier sold out once its sales end date has passed', () => {
    const closed: TicketTier = { ...general, name: 'Early', salesEnd: '2026-10-01T00:00:00Z' }
    const [view] = tierViews([closed], [], new Date('2026-10-13T00:00:00Z'))
    expect(view.onSale).toBe(false)
    expect(view.soldOut).toBe(true)
  })

  it('refuses guests that do not fit, or any guest once a tier is sold out', () => {
    expect(tierRoomError(vip, 8, 2)).toBeNull()
    expect(tierRoomError(vip, 8, 3)).toBe('Sorry, only 2 places are left on VIP.')
    expect(tierRoomError(vip, 9, 2)).toBe('Sorry, only 1 place is left on VIP.')
    expect(tierRoomError(vip, 10, 1)).toBe('Sorry, VIP is sold out.')
    expect(tierRoomError(general, 500, 20)).toBeNull()
    expect(tierRoomError({ ...general, salesEnd: '2026-10-01T00:00:00Z' }, 0, 1, new Date('2026-10-13T00:00:00Z'))).toBe(
      'General is no longer on sale.',
    )
  })

  it('reads stored tiers and drops bad ones', () => {
    expect(parseTiers(JSON.stringify([vip, { price: 3 }]))).toEqual([vip])
  })
})
