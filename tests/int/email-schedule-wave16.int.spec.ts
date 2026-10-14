// @vitest-environment node
// When emails are sent (email-schedule global): the pure rules. No database.
import { describe, expect, it } from 'vitest'

import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { renderTemplate } from '@/features/email/renderTemplate'
import {
  clockMinutes,
  eventHoursFrom,
  eventsDueForReminder,
  formatWhen,
  isInQuietHours,
  isTemplateEnabled,
  quietHoursHold,
  renewalDaysFrom,
  rsvpNeedsReminder,
  scheduleKeyFor,
  SCHEDULE_KEYS,
  SCHEDULE_TEMPLATES,
} from '@/features/email/schedule'

const SYDNEY = 'Australia/Sydney'

describe('which switch governs an email', () => {
  it('maps each reminder and notification template to its switch', () => {
    expect(scheduleKeyFor('member.renewal')).toBe('membershipRenewal')
    expect(scheduleKeyFor('event.reminder')).toBe('eventReminder')
    expect(scheduleKeyFor('rsvp.confirmation')).toBe('rsvpConfirmation')
    expect(scheduleKeyFor('approval.submitted')).toBe('approvalSubmitted')
    expect(scheduleKeyFor('approval.step-ready')).toBe('approvalSubmitted')
    expect(scheduleKeyFor('approval.decision')).toBe('approvalDecision')
    expect(scheduleKeyFor('stock.back-in-stock')).toBe('backInStock')
    expect(scheduleKeyFor('stock.alert')).toBe('lowStockAlert')
    expect(scheduleKeyFor('account.welcome')).toBe('accountWelcome')
    expect(scheduleKeyFor('account.exists')).toBe('accountAlreadyRegistered')
  })

  it('never holds a password reset, a test send or a resend', () => {
    expect(scheduleKeyFor('account.reset')).toBeNull()
    expect(scheduleKeyFor('test')).toBeNull()
    expect(scheduleKeyFor('member.renewal', 42)).toBeNull()
    expect(scheduleKeyFor('account.welcome', 7)).toBeNull()
  })

  it('leaves transactional and order mail ungated', () => {
    expect(scheduleKeyFor('order.completed')).toBeNull()
    expect(scheduleKeyFor('gift-card.delivery')).toBeNull()
    expect(scheduleKeyFor('cart.abandoned')).toBeNull()
    expect(scheduleKeyFor('form.notification')).toBeNull()
    expect(scheduleKeyFor(undefined)).toBeNull()
    expect(scheduleKeyFor('other')).toBeNull()
  })

  it('maps only to keys the global defines', () => {
    for (const key of Object.values(SCHEDULE_TEMPLATES)) expect(SCHEDULE_KEYS).toContain(key)
  })
})

describe('on and off', () => {
  it('defaults to on for every switch except the event reminder', () => {
    expect(isTemplateEnabled(null, 'membershipRenewal')).toBe(true)
    expect(isTemplateEnabled(null, 'approvalDecision')).toBe(true)
    expect(isTemplateEnabled(null, 'eventReminder')).toBe(false)
  })

  it('reads a saved switch', () => {
    expect(isTemplateEnabled({ rsvpConfirmation: { enabled: false } }, 'rsvpConfirmation')).toBe(false)
    expect(isTemplateEnabled({ eventReminder: { enabled: true } }, 'eventReminder')).toBe(true)
  })

  it('treats a missing value as the default, not as off', () => {
    expect(isTemplateEnabled({ rsvpConfirmation: null }, 'rsvpConfirmation')).toBe(true)
    expect(isTemplateEnabled({ eventReminder: { hoursBefore: 4 } }, 'eventReminder')).toBe(false)
  })

  it('keeps password reset on whatever is saved', () => {
    expect(isTemplateEnabled({ accountReset: { enabled: false } }, 'accountReset')).toBe(true)
  })
})

describe('reminder timing', () => {
  it('uses the schedule days when they are whole and at least 1', () => {
    expect(renewalDaysFrom({ membershipRenewal: { daysBefore: 3 } }, 7)).toBe(3)
    expect(renewalDaysFrom({ membershipRenewal: { daysBefore: 0 } }, 7)).toBe(7)
    expect(renewalDaysFrom({ membershipRenewal: { daysBefore: 2.5 } }, 7)).toBe(7)
    expect(renewalDaysFrom({ membershipRenewal: { daysBefore: null } }, 5)).toBe(5)
    expect(renewalDaysFrom(null, 5)).toBe(5)
  })

  it('uses the event hours when they are at least 1, otherwise 24', () => {
    expect(eventHoursFrom({ eventReminder: { hoursBefore: 2 } })).toBe(2)
    expect(eventHoursFrom({ eventReminder: { hoursBefore: 0 } })).toBe(24)
    expect(eventHoursFrom(null)).toBe(24)
  })
})

describe('quiet hours', () => {
  it('reads HH:MM values and rejects anything else', () => {
    expect(clockMinutes('21:00')).toBe(21 * 60)
    expect(clockMinutes('07:30')).toBe(450)
    expect(clockMinutes('24:00')).toBeNull()
    expect(clockMinutes('9pm')).toBeNull()
    expect(clockMinutes(undefined)).toBeNull()
  })

  it('holds across midnight in the site time zone', () => {
    // 2026-10-14 23:30 Sydney (AEDT, UTC+11) is 12:30 UTC.
    expect(isInQuietHours(new Date('2026-10-14T12:30:00Z'), SYDNEY, '21:00', '07:00')).toBe(true)
    // 2026-10-14 05:30 Sydney is 18:30 UTC on the 13th.
    expect(isInQuietHours(new Date('2026-10-13T18:30:00Z'), SYDNEY, '21:00', '07:00')).toBe(true)
    // 2026-10-14 12:00 Sydney is 01:00 UTC.
    expect(isInQuietHours(new Date('2026-10-14T01:00:00Z'), SYDNEY, '21:00', '07:00')).toBe(false)
  })

  it('does not hold when start and end are equal, or the zone is bad', () => {
    expect(isInQuietHours(new Date('2026-10-14T12:30:00Z'), SYDNEY, '09:00', '09:00')).toBe(false)
    expect(isInQuietHours(new Date('2026-10-14T12:30:00Z'), 'Not/AZone', '21:00', '07:00')).toBe(false)
  })

  it('holds only when the switch is on', () => {
    const late = new Date('2026-10-14T12:30:00Z')
    expect(quietHoursHold({ quietHours: { enabled: false, start: '21:00', end: '07:00' } }, late, SYDNEY)).toBe(false)
    expect(quietHoursHold({ quietHours: { enabled: true, start: '21:00', end: '07:00' } }, late, SYDNEY)).toBe(true)
    expect(quietHoursHold(null, late, SYDNEY)).toBe(false)
  })
})

describe('event reminders', () => {
  const now = new Date('2026-10-14T00:00:00Z')

  it('picks events starting within the window, skipping past and trashed ones', () => {
    const events = [
      { id: 1, startDate: '2026-10-14T05:00:00Z' },
      { id: 2, startDate: '2026-10-15T05:00:00Z' },
      { id: 3, startDate: '2026-10-13T05:00:00Z' },
      { id: 4, startDate: '2026-10-14T05:00:00Z', trashedAt: '2026-10-10T00:00:00Z' },
      { id: 5, startDate: 'not a date' },
    ]
    expect(eventsDueForReminder(events, now, 24).map((e) => e.id)).toEqual([1])
    expect(eventsDueForReminder(events, now, 48).map((e) => e.id)).toEqual([1, 2])
  })

  it('reminds only RSVPs with an address that have not been reminded', () => {
    expect(rsvpNeedsReminder({ id: 1, email: 'a@example.test', reminderSentAt: null })).toBe(true)
    expect(rsvpNeedsReminder({ id: 2, email: 'a@example.test', reminderSentAt: '2026-10-13T00:00:00Z' })).toBe(false)
    expect(rsvpNeedsReminder({ id: 3, email: '  ' })).toBe(false)
    expect(rsvpNeedsReminder({ id: 4 })).toBe(false)
  })

  it('formats the start in the site time zone', () => {
    const text = formatWhen('2026-10-14T05:00:00Z', SYDNEY)
    expect(text).toContain('2026')
    expect(text).toContain('4:00')
    expect(formatWhen('nonsense', SYDNEY)).toBe('')
  })

  it('renders the reminder wording with its tags filled', () => {
    const mail = renderTemplate(EMAIL_TEMPLATE_DEFAULTS.eventReminder, {
      name: 'Ana',
      eventTitle: 'Spring Market',
      when: 'Wednesday 14 October 2026 at 3:00 pm',
      guestCount: 2,
    })
    expect(mail.subject).toBe('Reminder: Spring Market is Wednesday 14 October 2026 at 3:00 pm')
    expect(mail.text).toContain('Hi Ana, a reminder that Spring Market is on Wednesday')
    expect(mail.text).toContain('Guests: 2')
  })
})
