import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { push, replace, pathname } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), pathname: { value: '/admin/collections/forms' } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname.value,
}))

import { ListSectionTabs, sectionTabHref } from '@/admin/views/ListSectionTabs'
import { EditTabs } from '@/admin/views/EditTabs'
import { resolveSectionTab, resolveSectionTabs, sectionTabParam, type SectionAccess } from '@/admin/list/viewTabs'
import { resultsTabState, type ResultsAccess } from '@/admin/views/results/resultsTabs'
import {
  allCsvFilename,
  buildAllRsvpsCsv,
  buildAllSubmissionsCsv,
  buildRsvpsWhere,
  buildSubmissionsWhere,
  dayEnd,
  dayStart,
  mapAllRsvpRow,
  mapAllSubmissionRow,
  parseSearch,
} from '@/admin/views/results/rows'
import { formatUplift, summariseGoal } from '@/features/abTesting/overview'
import type { GoalResult, VariantResult } from '@/features/abTesting/types'

const everything: SectionAccess = { isAdmin: true, canRead: () => true, canUpdate: () => true }
const noAdmin = (overrides: Partial<SectionAccess>): SectionAccess => ({ ...everything, isAdmin: false, ...overrides })

describe('resolveSectionTabs', () => {
  it('gives each of the three collections a first tab for the list and a second for the results', () => {
    expect(resolveSectionTabs('forms', everything).map((tab) => tab.label)).toEqual(['Forms', 'Submissions'])
    expect(resolveSectionTabs('events', everything).map((tab) => tab.label)).toEqual(['Events', 'RSVPs'])
    expect(resolveSectionTabs('ab-tests', everything).map((tab) => tab.label)).toEqual(['Tests', 'Results'])
  })

  it('gives nothing to other collections or to prototype names', () => {
    expect(resolveSectionTabs('pages', everything)).toEqual([])
    expect(resolveSectionTabs('constructor', everything)).toEqual([])
  })

  it('marks the first tab as the default', () => {
    const tabs = resolveSectionTabs('forms', everything)
    expect(tabs.map((tab) => tab.primary)).toEqual([true, false])
    expect(sectionTabParam(tabs[0])).toBeNull()
    expect(sectionTabParam(tabs[1])).toBe('submissions')
  })

  it('opens every tab for an administrator', () => {
    const none = noAdmin({ canRead: () => false, canUpdate: () => false })
    expect(resolveSectionTabs('forms', { ...none, isAdmin: true }).every((tab) => tab.allowed)).toBe(true)
  })

  it('keeps a tab the user may not open, marked disabled with a reason', () => {
    const tabs = resolveSectionTabs('forms', noAdmin({ canRead: (slug) => slug === 'forms' }))
    expect(tabs).toHaveLength(2)
    expect(tabs[1].allowed).toBe(false)
    expect(tabs[1].deniedReason).not.toBe('')
  })

  it('opens Submissions for a role that can read form submissions', () => {
    const tabs = resolveSectionTabs('forms', noAdmin({ canRead: (slug) => slug === 'form-submissions' }))
    expect(tabs[1].allowed).toBe(true)
  })

  it('needs event update as well as RSVP read for the RSVPs tab', () => {
    const readOnly = resolveSectionTabs('events', noAdmin({ canRead: () => true, canUpdate: () => false }))
    expect(readOnly[1].allowed).toBe(false)
    const editor = resolveSectionTabs('events', noAdmin({ canRead: () => true, canUpdate: (slug) => slug === 'events' }))
    expect(editor[1].allowed).toBe(true)
  })

  it('picks the tab named in ?tab= and falls back to the first', () => {
    const tabs = resolveSectionTabs('events', everything)
    expect(resolveSectionTab(tabs, 'rsvps').key).toBe('rsvps')
    expect(resolveSectionTab(tabs, 'nope').key).toBe('events')
    expect(resolveSectionTab(tabs, null).key).toBe('events')
  })
})

describe('ListSectionTabs', () => {
  const infos = resolveSectionTabs('forms', noAdmin({ canRead: (slug) => slug === 'forms' })).map((tab) => ({
    key: tab.key,
    label: tab.label,
    allowed: tab.allowed,
    primary: tab.primary,
    deniedReason: tab.deniedReason,
  }))
  const open = resolveSectionTabs('forms', everything).map((tab) => ({
    key: tab.key,
    label: tab.label,
    allowed: tab.allowed,
    primary: tab.primary,
    deniedReason: tab.deniedReason,
  }))

  beforeEach(() => {
    push.mockClear()
    replace.mockClear()
    pathname.value = '/admin/collections/forms'
    window.history.replaceState(null, '', '/admin/collections/forms')
  })
  afterEach(() => cleanup())

  it('renders a real tablist with a selected tab', () => {
    render(createElement(ListSectionTabs, { tabs: open, activeKey: 'forms', label: 'Forms sections' }))
    const list = screen.getByRole('tablist', { name: 'Forms sections' })
    expect(list).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Forms', 'Submissions'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')
  })

  it('links the first tab to the plain list URL and the others to ?tab=', () => {
    render(createElement(ListSectionTabs, { tabs: open, activeKey: 'forms', label: 'Forms sections' }))
    expect(screen.getByRole('tab', { name: 'Forms' }).getAttribute('href')).toBe('/admin/collections/forms')
    expect(screen.getByRole('tab', { name: 'Submissions' }).getAttribute('href')).toBe('/admin/collections/forms?tab=submissions')
    expect(sectionTabHref('/x', { key: 'a', primary: false })).toBe('/x?tab=a')
  })

  it('moves with the arrow keys, Home and End', () => {
    render(createElement(ListSectionTabs, { tabs: open, activeKey: 'forms', label: 'Forms sections' }))
    const first = screen.getByRole('tab', { name: 'Forms' })
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(push).toHaveBeenLastCalledWith('/admin/collections/forms?tab=submissions')
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(push).toHaveBeenLastCalledWith('/admin/collections/forms?tab=submissions')
    fireEvent.keyDown(first, { key: 'End' })
    expect(push).toHaveBeenLastCalledWith('/admin/collections/forms?tab=submissions')
    fireEvent.keyDown(first, { key: 'Home' })
    expect(push).toHaveBeenLastCalledWith('/admin/collections/forms')
  })

  it('shows a tab the user cannot open as unavailable, with its reason', () => {
    render(createElement(ListSectionTabs, { tabs: infos, activeKey: 'forms', label: 'Forms sections' }))
    const locked = screen.getByRole('tab', { name: /Submissions/ })
    expect(locked.getAttribute('aria-disabled')).toBe('true')
    expect(locked.getAttribute('title')).toContain('cannot read form submissions')
    expect(locked.textContent).toContain('no access')
  })

  it('opens the tab named in the hash when the URL has no ?tab=', () => {
    window.history.replaceState(null, '', '/admin/collections/forms#submissions')
    render(createElement(ListSectionTabs, { tabs: open, activeKey: 'forms', label: 'Forms sections' }))
    expect(replace).toHaveBeenCalledWith('/admin/collections/forms?tab=submissions')
  })

  it('does not redirect when the hash is unknown', () => {
    window.history.replaceState(null, '', '/admin/collections/forms#whatever')
    render(createElement(ListSectionTabs, { tabs: open, activeKey: 'forms', label: 'Forms sections' }))
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('resultsTabState (item page)', () => {
  const all: ResultsAccess = { isAdmin: true, canRead: () => true, canUpdate: () => true }
  const nonAdmin = (overrides: Partial<ResultsAccess>): ResultsAccess => ({ ...all, isAdmin: false, ...overrides })

  it('is open for a non-admin who can read what the tab shows', () => {
    const state = resultsTabState('forms', 4, nonAdmin({ canRead: () => true }))
    expect(state).toMatchObject({ label: 'Submissions', allowed: true })
  })

  it('is kept but disabled, with a reason, when the user lacks access', () => {
    const state = resultsTabState('forms', 4, nonAdmin({ canRead: () => false }))
    expect(state?.allowed).toBe(false)
    expect(state?.deniedReason).toContain('cannot read form submissions')
    const rsvps = resultsTabState('events', 4, nonAdmin({ canRead: () => true, canUpdate: () => false }))
    expect(rsvps?.allowed).toBe(false)
  })

  it('is still absent on the create page and for other collections', () => {
    expect(resultsTabState('forms', undefined, all)).toBeNull()
    expect(resultsTabState('pages', 4, all)).toBeNull()
  })
})

describe('EditTabs when the user may not open the results tab', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
  })

  it('keeps the tab visible, marked unavailable, and explains why in the panel', () => {
    render(
      createElement(EditTabs, {
        resultsLabel: 'Submissions',
        edit: createElement('p', null, 'form'),
        results: createElement('div', { 'data-testid': 'secret' }, 'secret'),
        deniedReason: 'Your role cannot read form submissions.',
      }),
    )
    const tab = screen.getByRole('tab', { name: /Submissions/ })
    expect(tab.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(tab)
    expect(screen.getByRole('status').textContent).toContain('cannot read form submissions')
    expect(screen.queryByTestId('secret')).toBeNull()
  })
})

describe('across-every-form and every-event filters', () => {
  it('reads search text trimmed and capped', () => {
    expect(parseSearch('  ada ')).toBe('ada')
    expect(parseSearch(null)).toBe('')
    expect(parseSearch('x'.repeat(300))).toHaveLength(100)
  })

  it('turns a day into the start and end of that day, and rejects anything else', () => {
    expect(dayStart('2026-10-05')).toBe('2026-10-05T00:00:00.000Z')
    expect(dayEnd('2026-10-05')).toBe('2026-10-05T23:59:59.999Z')
    expect(dayStart('05/10/2026')).toBeNull()
    expect(dayEnd('2026-13-45')).toBeNull()
    expect(dayStart(null)).toBeNull()
  })

  it('builds no where for no filters and a single clause for one', () => {
    expect(buildSubmissionsWhere({ form: null, status: null, q: '', from: null, to: null })).toBeUndefined()
    expect(buildSubmissionsWhere({ form: 3, status: null, q: '', from: null, to: null })).toEqual({ form: { equals: 3 } })
  })

  it('combines form, payment status, search and a date range, and ignores an unknown status', () => {
    const where = buildSubmissionsWhere({ form: 3, status: 'paid', q: 'ada', from: '2026-10-01', to: '2026-10-31' })
    expect(where).toEqual({
      and: [
        { form: { equals: 3 } },
        { paymentStatus: { equals: 'paid' } },
        { summary: { contains: 'ada' } },
        { createdAt: { greater_than_equal: '2026-10-01T00:00:00.000Z' } },
        { createdAt: { less_than_equal: '2026-10-31T23:59:59.999Z' } },
      ],
    })
    expect(buildSubmissionsWhere({ form: null, status: 'refunded', q: '', from: null, to: null })).toBeUndefined()
  })

  it('searches RSVPs by name or email', () => {
    expect(buildRsvpsWhere({ event: 4, q: 'ada', from: null, to: null })).toEqual({
      and: [{ event: { equals: 4 } }, { or: [{ name: { contains: 'ada' } }, { email: { contains: 'ada' } }] }],
    })
  })

  it('maps a submission with a populated form and with only an id', () => {
    expect(mapAllSubmissionRow({ id: 1, form: { id: 5, title: 'Contact' }, summary: 'Ada', createdAt: 'x' })).toMatchObject({
      formId: 5,
      formTitle: 'Contact',
      summary: 'Ada',
      paymentStatus: 'none',
    })
    expect(mapAllSubmissionRow({ id: 2, form: 9 }).formTitle).toBe('Form #9')
  })

  it('maps an RSVP with its event', () => {
    expect(mapAllRsvpRow({ id: 1, event: { id: 4, title: 'Gala' }, name: 'Ada', email: 'a@example.com' })).toMatchObject({
      eventId: 4,
      eventTitle: 'Gala',
      guestCount: 1,
    })
    expect(mapAllRsvpRow({ id: 1, event: 8 }).eventTitle).toBe('Event #8')
  })

  it('writes CSVs with the form or event name and defuses formulas', () => {
    const submissions = buildAllSubmissionsCsv([
      { id: 1, formId: 2, formTitle: 'Contact', submittedAt: 'd', summary: '=1+1', paymentStatus: 'none', total: null },
    ])
    expect(submissions.split('\r\n')[0]).toBe('Entry ID,Form,Submitted,Summary,Payment,Total')
    expect(submissions).toContain('\t=1+1')
    const rsvps = buildAllRsvpsCsv([
      { id: 1, eventId: 3, eventTitle: 'Gala, night', name: 'Ada', email: 'a@x.com', guestCount: 2, notes: '', createdAt: 'd' },
    ])
    expect(rsvps.split('\r\n')[0]).toBe('Entry ID,Event,Name,Email,Guests,Notes,Registered')
    expect(rsvps).toContain('"Gala, night"')
    expect(allCsvFilename('rsvps', new Date('2026-10-11T00:00:00Z'))).toBe('all-rsvps-2026-10-11.csv')
  })
})

describe('A/B results overview summary', () => {
  const variant = (over: Partial<VariantResult>): VariantResult => ({
    key: 'a',
    label: 'A',
    isControl: false,
    visitors: 100,
    conversions: 10,
    rate: 0.1,
    interval: null,
    lift: null,
    pValue: null,
    ...over,
  })
  const goal = (readiness: GoalResult['readiness'], variants: VariantResult[]): GoalResult => ({
    key: 'g',
    label: 'Sign up',
    type: 'page-visited',
    variants,
    readiness,
    verdict: '',
    neededPerArm: null,
  })

  it('names the best challenger as winner only when the result is significant', () => {
    const variants = [variant({ key: 'c', label: 'Control', isControl: true }), variant({ key: 'b', label: 'Bold', lift: 0.25 }), variant({ key: 'd', label: 'Dull', lift: -0.1 })]
    expect(summariseGoal(goal('significant', variants))).toMatchObject({ winner: 'Bold', uplift: 0.25, visitors: 300 })
    expect(summariseGoal(goal('inconclusive', variants))).toMatchObject({ winner: null, leader: 'Bold', uplift: 0.25 })
  })

  it('calls the control the winner when it is clearly ahead', () => {
    const variants = [variant({ key: 'c', label: 'Control', isControl: true }), variant({ key: 'b', label: 'Bold', lift: -0.3 })]
    expect(summariseGoal(goal('significant', variants))).toMatchObject({ winner: 'Control', uplift: -0.3 })
  })

  it('has no winner or uplift without data', () => {
    expect(summariseGoal(goal('no-data', [variant({ isControl: true })]))).toMatchObject({ winner: null, uplift: null, leader: null })
  })

  it('formats the uplift with a sign', () => {
    expect(formatUplift(0.123)).toBe('+12.3%')
    expect(formatUplift(-0.04)).toBe('-4.0%')
    expect(formatUplift(null)).toBe('-')
  })
})
