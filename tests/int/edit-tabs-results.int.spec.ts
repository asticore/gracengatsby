import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// EditView reads the admin language on the server; the spec runs in jsdom, so use English.
vi.mock('@/admin/i18n/serverUi', () => ({
  getAdminUi: async () => {
    const { UI_STRING_SOURCE, translateWith } = await import('@/features/uiStrings')
    const dict = UI_STRING_SOURCE
    return { locale: 'en', dir: 'ltr', source: 'default', dict, t: (key: keyof typeof dict, vars?: Record<string, string | number>) => translateWith(dict, key, vars) }
  },
}))
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { EditTabs } from '@/admin/views/EditTabs'
import { resultsTabFor, tabFromHash, type ResultsAccess } from '@/admin/views/results/resultsTabs'
import {
  buildRsvpCsv,
  cellText,
  csvCell,
  formatWhen,
  mapRsvpRow,
  mapSubmissionRow,
  pageInfo,
  parseId,
  parsePage,
  rsvpCsvFilename,
  submissionColumns,
  sumGuests,
} from '@/admin/views/results/rows'
import type { FormDoc } from '@/features/forms/types'
import { EditView } from '@/admin/views/EditView'
import { ABResultsTab } from '@/admin/views/results/ABResultsTab'
import { EventResultsTab } from '@/admin/views/results/EventResultsTab'
import { FormResultsTab } from '@/admin/views/results/FormResultsTab'
import { isAdmin, roleAccess, roleOrPublished } from '@/access/ecommerceAccess'
import { isAdminOrRsvpOwner } from '@/features/accounts/access'

// EditView is a server component; these stand in for what it would fetch and render, and the
// tests read the element tree it returns.
const { getAdminContext } = vi.hoisted(() => ({ getAdminContext: vi.fn() }))

vi.mock('@/admin/auth', () => ({
  getAdminContext,
  hasAdminPanelAccess: () => true,
  getCollectionConfig: (_engine: unknown, slug: string) => ({ slug, labels: { singular: slug }, fields: [] as unknown[], admin: {} }),
}))
vi.mock('@/admin/fields/shared', () => ({ sanitizeFieldsForClient: (fields: unknown): unknown => fields }))
vi.mock('@/views/visualEditor/surfaces', () => ({ VISUAL_EDITOR_SURFACES: {} }))
vi.mock('@/admin/views/EditForm', () => ({ EditForm: (): null => null }))
vi.mock('@/admin/views/results/ABResultsTab', () => ({ ABResultsTab: (): null => null }))
vi.mock('@/admin/views/results/EventResultsTab', () => ({ EventResultsTab: (): null => null }))
vi.mock('@/admin/views/results/FormResultsTab', () => ({ FormResultsTab: (): null => null }))

describe('resultsTabFor', () => {
  const everything: ResultsAccess = { isAdmin: true, canRead: () => true, canUpdate: () => true }
  const access = (overrides: Partial<ResultsAccess>): ResultsAccess => ({ ...everything, isAdmin: false, ...overrides })

  it('gives no results tab on the create page', () => {
    expect(resultsTabFor('events', undefined, everything)).toBeNull()
  })

  it('gives the labelled tab for each of the three documents', () => {
    expect(resultsTabFor('events', 4, everything)?.label).toBe('RSVPs')
    expect(resultsTabFor('forms', 4, everything)?.label).toBe('Submissions')
    expect(resultsTabFor('ab-tests', 4, everything)?.label).toBe('Results')
  })

  it('gives nothing for a collection without a results tab', () => {
    expect(resultsTabFor('pages', 4, everything)).toBeNull()
    expect(resultsTabFor('constructor', 4, everything)).toBeNull()
  })

  it('hides the tab when the user cannot read what it shows', () => {
    const readEventsOnly = access({ canRead: (collection) => collection === 'events', canUpdate: () => true })
    expect(resultsTabFor('events', 4, readEventsOnly)).toBeNull()
    expect(resultsTabFor('forms', 4, readEventsOnly)).toBeNull()
  })

  it('shows the RSVPs tab only to admins or people who can update the event', () => {
    // An owner of one RSVP can read the RSVP but not update the event: no tab, since the list is every RSVP.
    const rsvpOwner = access({ canRead: () => true, canUpdate: () => false })
    expect(resultsTabFor('events', 4, rsvpOwner)).toBeNull()
    const eventEditor = access({ canRead: () => true, canUpdate: (collection) => collection === 'events' })
    expect(resultsTabFor('events', 4, eventEditor)?.label).toBe('RSVPs')
    // An admin sees it without an explicit update grant.
    expect(resultsTabFor('events', 4, { isAdmin: true, canRead: () => true, canUpdate: () => false })?.label).toBe('RSVPs')
  })

  it('does not apply the event-update rule to the other tabs', () => {
    const readOnly = access({ canRead: () => true, canUpdate: () => false })
    expect(resultsTabFor('forms', 4, readOnly)?.label).toBe('Submissions')
    expect(resultsTabFor('ab-tests', 4, readOnly)?.label).toBe('Results')
  })
})

describe('tabFromHash', () => {
  it('selects results only for #results', () => {
    expect(tabFromHash('#results')).toBe('results')
    expect(tabFromHash('results')).toBe('results')
    expect(tabFromHash('')).toBe('edit')
    expect(tabFromHash('#edit')).toBe('edit')
    expect(tabFromHash('#Results')).toBe('edit')
  })
})

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Ada Lovelace')).toBe('Ada Lovelace')
    expect(csvCell(2)).toBe('2')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Lovelace, Ada')).toBe('"Lovelace, Ada"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('defuses cells a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\t=HYPERLINK(""x"")"')
    expect(csvCell('+15550100')).toBe('\t+15550100')
    expect(csvCell('-2+3')).toBe('\t-2+3')
    expect(csvCell('@SUM(A1)')).toBe('\t@SUM(A1)')
  })
})

describe('buildRsvpCsv', () => {
  it('writes a header and one row per RSVP with CRLF endings', () => {
    const csv = buildRsvpCsv([
      { id: 7, name: 'Ada', email: 'ada@example.com', guestCount: 2, ticketTier: 'VIP', notes: 'vegan, please', createdAt: '2026-10-01T10:00:00.000Z' },
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Entry ID,Name,Email,Guests,Ticket,Notes,Registered')
    expect(lines[1]).toBe('7,Ada,ada@example.com,2,VIP,"vegan, please",2026-10-01T10:00:00.000Z')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('neutralises a formula typed into the name', () => {
    const csv = buildRsvpCsv([
      { id: 1, name: '=cmd|"/c calc"!A1', email: 'x@example.com', guestCount: 1, notes: '', createdAt: '' },
    ])
    expect(csv).not.toMatch(/(^|,)=cmd/m)
    expect(csv).toContain('"\t=cmd|""/c calc""!A1"')
  })
})

describe('rsvpCsvFilename', () => {
  it('slugifies the event title and dates the file', () => {
    expect(rsvpCsvFilename('Spring Gala: Night #2!', new Date('2026-10-11T08:00:00Z'))).toBe(
      'spring-gala-night-2-rsvps-2026-10-11.csv',
    )
  })

  it('falls back when the title has no usable characters', () => {
    expect(rsvpCsvFilename('!!!', new Date('2026-10-11T08:00:00Z'))).toBe('event-rsvps-2026-10-11.csv')
  })
})

describe('row mapping', () => {
  it('maps an RSVP, defaulting guests to one when missing', () => {
    expect(mapRsvpRow({ id: 3, name: 'Ada', email: 'a@example.com', guestCount: 4, notes: 'hi', createdAt: 'x' })).toEqual({
      id: 3,
      name: 'Ada',
      email: 'a@example.com',
      guestCount: 4,
      ticketTier: '',
      notes: 'hi',
      createdAt: 'x',
    })
    expect(mapRsvpRow({ id: 'r1' }).guestCount).toBe(1)
  })

  it('sums guests across rows', () => {
    expect(sumGuests([mapRsvpRow({ guestCount: 2 }), mapRsvpRow({ guestCount: 3 }), mapRsvpRow({})])).toBe(6)
  })

  it('takes only answer fields as columns, in form order', () => {
    const form = {
      title: 'Contact',
      fields: [
        { type: 'text', name: 'name', label: 'Your name' },
        { type: 'section', label: 'About you' },
        { type: 'html', html: '<p>hi</p>' },
        { type: 'email', name: 'email' },
        { type: 'textarea', name: 'message', label: '' },
      ],
    } as unknown as FormDoc
    expect(submissionColumns(form)).toEqual([
      { name: 'name', label: 'Your name' },
      { name: 'email', label: 'email' },
      { name: 'message', label: 'message' },
    ])
  })

  it('keeps only the form columns in a submission row and defaults the payment status', () => {
    const columns = [{ name: 'name', label: 'Name' }]
    const row = mapSubmissionRow(
      { id: 9, values: { name: 'Ada', ip: '10.0.0.1' }, createdAt: '2026-10-02', total: null },
      columns,
    )
    expect(row).toEqual({
      id: 9,
      submittedAt: '2026-10-02',
      total: null,
      paymentStatus: 'none',
      values: { name: 'Ada' },
    })
  })

  it('shows arrays joined, objects as JSON and missing answers as empty', () => {
    expect(cellText(['red', 'blue'])).toBe('red; blue')
    expect(cellText({ a: 1 })).toBe('{"a":1}')
    expect(cellText(null)).toBe('')
    expect(cellText(42)).toBe('42')
  })

  it('formats an unparseable date as empty', () => {
    expect(formatWhen('not a date')).toBe('')
  })
})

describe('paging', () => {
  it('reads a page number and falls back to 1', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage(null)).toBe(1)
  })

  it('reads a positive integer id only', () => {
    expect(parseId('12')).toBe(12)
    expect(parseId('1.5')).toBeNull()
    expect(parseId('0')).toBeNull()
    expect(parseId(null)).toBeNull()
  })

  it('works out pages from the total', () => {
    expect(pageInfo(1, 25, 0)).toMatchObject({ totalPages: 1, hasNextPage: false, hasPrevPage: false })
    expect(pageInfo(1, 25, 25)).toMatchObject({ totalPages: 1, hasNextPage: false })
    expect(pageInfo(1, 25, 26)).toMatchObject({ totalPages: 2, hasNextPage: true })
    expect(pageInfo(2, 25, 26)).toMatchObject({ totalPages: 2, hasNextPage: false, hasPrevPage: true })
  })
})

describe('EditTabs', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
    vi.useRealTimers()
  })

  const renderTabs = () => {
    const results = createElement('div', { 'data-testid': 'results-body' }, 'Results body')
    const edit = createElement('input', { 'aria-label': 'Title', defaultValue: 'Spring' })
    return render(createElement(EditTabs, { resultsLabel: 'RSVPs', edit, results }))
  }

  it('shows the edit panel by default and mounts results lazily', () => {
    renderTabs()
    const editPanel = screen.getByRole('tabpanel', { hidden: true, name: 'Edit' })
    expect(editPanel.hidden).toBe(false)
    expect(screen.getByRole('tab', { name: 'Edit' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByTestId('results-body')).toBeNull()
  })

  it('switches to results, keeps the edit panel mounted, and writes the hash', () => {
    renderTabs()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsaved edit' } })

    fireEvent.click(screen.getByRole('tab', { name: 'RSVPs' }))
    expect(window.location.hash).toBe('#results')
    expect(screen.getByTestId('results-body')).toBeTruthy()
    expect(screen.getByLabelText('Title').closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }))
    expect(window.location.hash).toBe('')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Unsaved edit')
  })

  it('opens on the results tab when the page is loaded at #results', async () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', `/admin/content/events/3#results`)
    renderTabs()
    await act(async () => {
      vi.runOnlyPendingTimers()
    })
    expect(screen.getByRole('tab', { name: 'RSVPs' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('results-body')).toBeTruthy()
  })

  it('moves between tabs with the arrow keys', () => {
    renderTabs()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Edit' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'RSVPs' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'RSVPs' }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'RSVPs' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Edit' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('EditView results tab for an admin', () => {
  type Grant = (args: { req: { user: unknown; engine: unknown } }) => unknown
  const allowed = (grant: Grant, user: unknown) => {
    const result = grant({ req: { user, engine: undefined } })
    return result !== false && result !== undefined && result !== null
  }

  // Each grant is the real access helper the collection uses, run for the signed-in user.
  const ADMIN = { id: 1, roles: ['admin'] }
  const permissionsFor = (user: unknown) => {
    const grants: Record<string, Record<string, Grant>> = {
      events: { read: roleOrPublished('events') as Grant, create: roleAccess('events', 'create') as Grant, update: roleAccess('events', 'update') as Grant },
      'event-rsvps': { read: isAdminOrRsvpOwner as Grant, update: isAdmin as Grant },
      forms: { read: isAdmin as Grant, update: isAdmin as Grant },
      'form-submissions': { read: isAdmin as Grant, update: isAdmin as Grant },
      'ab-tests': { read: isAdmin as Grant, update: isAdmin as Grant },
      pages: { read: roleOrPublished('pages') as Grant, update: roleAccess('pages', 'update') as Grant },
    }
    const collections: Record<string, Record<string, boolean>> = {}
    for (const [slug, rules] of Object.entries(grants)) {
      collections[slug] = Object.fromEntries(Object.entries(rules).map(([action, grant]) => [action, allowed(grant, user)]))
    }
    return { collections, globals: {} }
  }

  const context = () => ({
    engine: { findByID: vi.fn(async ({ id }: { id: number }) => ({ id, title: 'Doc', capacity: 40 })) },
    user: ADMIN,
    isAdmin: true,
    permissions: permissionsFor(ADMIN),
    can: () => true,
  })

  // The tab bar is the EditTabs element somewhere under the page's wrapper div.
  const findEditTabs = (node: ReactNode): ReactElement<{ resultsLabel: string; results: ReactNode }> | undefined => {
    if (!isValidElement(node)) return undefined
    if (node.type === EditTabs) return node as ReactElement<{ resultsLabel: string; results: ReactNode }>
    const children = ([] as ReactNode[]).concat((node.props as { children?: ReactNode }).children)
    for (const child of children) {
      const found = findEditTabs(child)
      if (found) return found
    }
    return undefined
  }

  beforeEach(() => {
    getAdminContext.mockReset()
    getAdminContext.mockResolvedValue(context())
  })

  it.each([
    ['events', 'RSVPs', EventResultsTab],
    ['forms', 'Submissions', FormResultsTab],
    ['ab-tests', 'Results', ABResultsTab],
  ] as const)('shows the %s results tab on an existing document', async (slug, label, panel) => {
    const page = await EditView({ collectionSlug: slug, id: 4 })
    const tabs = findEditTabs(page)
    expect(tabs, `${slug} edit page should wrap its form in the tab bar`).toBeDefined()
    expect(tabs?.props.resultsLabel).toBe(label)
    expect((tabs?.props.results as ReactElement).type).toBe(panel)
  })

  it('shows no results tab on the create page of those collections', async () => {
    expect(findEditTabs(await EditView({ collectionSlug: 'events' }))).toBeUndefined()
    expect(findEditTabs(await EditView({ collectionSlug: 'forms' }))).toBeUndefined()
    expect(findEditTabs(await EditView({ collectionSlug: 'ab-tests' }))).toBeUndefined()
  })

  it('shows no results tab for a collection that has none', async () => {
    expect(findEditTabs(await EditView({ collectionSlug: 'pages', id: 4 }))).toBeUndefined()
  })
})
