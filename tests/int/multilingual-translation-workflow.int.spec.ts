// @vitest-environment node
// Pure rules for the translation workflow: status, publishability, approval, assignment, the
// write rule the collection hook applies, the overview aggregation and the bulk body check.
// No engine and no database here - the hook and bulk route are covered by the migration specs
// and by reading these functions, which is the point of keeping them pure.
import { describe, expect, it } from 'vitest'

import type { MultilingualSettings } from '@/features/multilingual/settings'
import { parseBulkBody } from '@/features/multilingual/translationActions'
import { assignmentEmailText } from '@/features/multilingual/translationNotify'
import {
  buildOverviewRows,
  filterOverviewRows,
  itemKey,
  overviewColumns,
  OVERVIEW_DEFAULT_COLUMNS,
  pageOverviewRows,
  sortOverviewRows,
  statusOf,
  type OverviewItemInput,
} from '@/features/multilingual/translationOverview'
import {
  canApproveTranslation,
  computeTranslationStatus,
  effectiveAssignees,
  evaluateTranslationWrite,
  isTranslationPublishable,
  parseAssignedTo,
  parseTranslationRules,
  serialiseAssignedTo,
  type TranslationRules,
} from '@/features/multilingual/translationStatus'
import type { TranslationRow } from '@/features/multilingual/store'

const RULES: TranslationRules = { fr: { translators: [2, 3], reviewers: [4] } }

const settings = (over: Partial<MultilingualSettings> = {}): MultilingualSettings => ({
  enabled: true,
  defaultLocale: 'en',
  activeLocales: ['en', 'fr'],
  fallbackToDefault: true,
  showLanguageSwitcher: true,
  switcherPosition: 'header',
  requireReview: false,
  adminsBypassReview: true,
  translationRules: RULES,
  machine: { enabled: false, defaultProvider: null, overrides: {}, monthlyCharLimit: 0, autoDraft: false },
  ...over,
})

const REVIEW_ON = settings({ requireReview: true })
const NOW = '2026-10-28T10:00:00.000Z'
const translator = { id: 2, isAdmin: false }
const reviewer = { id: 4, isAdmin: false }
const admin = { id: 1, isAdmin: true }

describe('computeTranslationStatus', () => {
  it('is missing when there is no text, whatever the stored status says', () => {
    expect(computeTranslationStatus({ value: null, status: 'approved' })).toBe('missing')
    expect(computeTranslationStatus({ value: '   ', status: 'needs_review' })).toBe('missing')
  })

  it('reads a row written before the status column as approved', () => {
    expect(computeTranslationStatus({ value: 'Bonjour', status: null })).toBe('approved')
  })

  it('returns the stored status for a value with text', () => {
    expect(computeTranslationStatus({ value: 'Bonjour', status: 'machine_draft' })).toBe('machine_draft')
    expect(computeTranslationStatus({ value: 'Bonjour', status: 'needs_review' })).toBe('needs_review')
  })

  it('treats a changed source as needs_review, even when approved', () => {
    expect(computeTranslationStatus({ value: 'Bonjour', status: 'approved', sourceText: 'Hello' }, 'Hello there')).toBe(
      'needs_review',
    )
    expect(computeTranslationStatus({ value: 'Bonjour', status: 'approved', sourceText: 'Hello' }, 'Hello')).toBe('approved')
  })

  it('does not check staleness when the current source is not given', () => {
    expect(computeTranslationStatus({ value: 'Bonjour', status: 'approved', sourceText: 'Hello' })).toBe('approved')
  })

  it('treats an inconsistent missing-with-text row as needing a look', () => {
    expect(computeTranslationStatus({ value: 'Bonjour', status: 'missing' })).toBe('needs_review')
  })
})

describe('isTranslationPublishable', () => {
  it('shows anything with text when review is off, including machine drafts', () => {
    expect(isTranslationPublishable({ value: 'Bonjour', status: 'machine_draft' }, settings())).toBe(true)
    expect(isTranslationPublishable({ value: 'Bonjour', status: 'needs_review' }, settings())).toBe(true)
  })

  it('never shows a missing translation', () => {
    expect(isTranslationPublishable({ value: '', status: 'approved' }, settings())).toBe(false)
    expect(isTranslationPublishable(null, settings())).toBe(false)
  })

  it('shows only approved, current translations when review is on', () => {
    expect(isTranslationPublishable({ value: 'Bonjour', status: 'approved' }, REVIEW_ON)).toBe(true)
    expect(isTranslationPublishable({ value: 'Bonjour', status: 'machine_draft' }, REVIEW_ON)).toBe(false)
    expect(isTranslationPublishable({ value: 'Bonjour', status: 'needs_review' }, REVIEW_ON)).toBe(false)
  })

  it('hides an approved translation whose source has since changed', () => {
    const row = { value: 'Bonjour', status: 'approved', sourceText: 'Hello' }
    expect(isTranslationPublishable(row, REVIEW_ON, 'Hello, world')).toBe(false)
    expect(isTranslationPublishable(row, REVIEW_ON, 'Hello')).toBe(true)
  })
})

describe('translation rules and assignment', () => {
  it('reads rules from JSON, dropping bad locales and non-numeric ids', () => {
    const parsed = parseTranslationRules(JSON.stringify({ fr: { translators: [2, '3', 2, -1, 'x'], reviewers: [4] }, 'not a locale!': { translators: [9] } }))
    expect(parsed).toEqual({ fr: { translators: [2, 3], reviewers: [4] } })
  })

  it('reads malformed or empty rules as none, so a bad save cannot lock everyone out', () => {
    expect(parseTranslationRules('{not json')).toEqual({})
    expect(parseTranslationRules(null)).toEqual({})
    expect(parseTranslationRules([])).toEqual({})
  })

  it('stores assignment as a JSON list, or null for nobody', () => {
    expect(serialiseAssignedTo([3, 3, 5])).toBe('[3,5]')
    expect(serialiseAssignedTo([])).toBeNull()
    expect(serialiseAssignedTo('[7]')).toBe('[7]')
    expect(parseAssignedTo('[7,"8"]')).toEqual([7, 8])
  })

  it('uses an item override before the language rules', () => {
    expect(effectiveAssignees({ status: 'missing', assignedTo: '[9]', locale: 'fr', rules: RULES })).toEqual([9])
  })

  it('follows translators while text is missing or a draft, and reviewers once it needs review', () => {
    expect(effectiveAssignees({ status: 'missing', assignedTo: null, locale: 'fr', rules: RULES })).toEqual([2, 3])
    expect(effectiveAssignees({ status: 'machine_draft', assignedTo: null, locale: 'fr', rules: RULES })).toEqual([2, 3])
    expect(effectiveAssignees({ status: 'needs_review', assignedTo: null, locale: 'fr', rules: RULES })).toEqual([4])
  })

  it('assigns nobody to an approved translation', () => {
    expect(effectiveAssignees({ status: 'approved', assignedTo: '[9]', locale: 'fr', rules: RULES })).toEqual([])
  })
})

describe('canApproveTranslation', () => {
  it('lets anyone who may write approve when review is off', () => {
    expect(canApproveTranslation(translator, 'fr', settings()).ok).toBe(true)
  })

  it('refuses a translator who is not a reviewer when review is on', () => {
    const gate = canApproveTranslation(translator, 'fr', REVIEW_ON)
    expect(gate.ok).toBe(false)
  })

  it('lets a named reviewer approve', () => {
    expect(canApproveTranslation(reviewer, 'fr', REVIEW_ON).ok).toBe(true)
  })

  it('lets an admin approve by default, and refuses one once bypass is off', () => {
    expect(canApproveTranslation(admin, 'fr', REVIEW_ON).ok).toBe(true)
    expect(canApproveTranslation(admin, 'fr', settings({ requireReview: true, adminsBypassReview: false })).ok).toBe(false)
  })

  it('accepts approval from admins only for a language with no reviewers', () => {
    expect(canApproveTranslation(translator, 'de', REVIEW_ON).ok).toBe(false)
    expect(canApproveTranslation(admin, 'de', REVIEW_ON).ok).toBe(true)
  })
})

describe('evaluateTranslationWrite', () => {
  const stored = (over: Partial<TranslationRow> = {}) => ({
    value: 'Bonjour',
    status: 'approved',
    sourceText: 'Hello',
    reviewedBy: 4,
    reviewedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  })

  it('sends an edit to needs_review when review is on, and clears the old approval', () => {
    const result = evaluateTranslationWrite({
      current: stored(),
      incoming: { value: 'Salut' },
      locale: 'fr',
      actor: translator,
      settings: REVIEW_ON,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, status: 'needs_review', patch: { status: 'needs_review', reviewedBy: null, reviewedAt: null } })
  })

  it('approves an edit outright when review is off', () => {
    const result = evaluateTranslationWrite({ current: stored(), incoming: { value: 'Salut' }, locale: 'fr', actor: translator, settings: settings(), now: NOW })
    expect(result).toMatchObject({ ok: true, status: 'approved' })
  })

  it('makes a cleared translation missing and forgets its approval', () => {
    const result = evaluateTranslationWrite({ current: stored(), incoming: { value: '' }, locale: 'fr', actor: translator, settings: REVIEW_ON, now: NOW })
    expect(result).toMatchObject({ ok: true, status: 'missing', patch: { status: 'missing', reviewedBy: null, reviewedAt: null } })
  })

  it('refuses an approval from a translator who is not a reviewer', () => {
    const result = evaluateTranslationWrite({
      current: stored({ status: 'needs_review' }),
      incoming: { status: 'approved' },
      locale: 'fr',
      actor: translator,
      settings: REVIEW_ON,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: false, code: 403 })
  })

  it('records the reviewer and time when a named reviewer approves', () => {
    const result = evaluateTranslationWrite({
      current: stored({ status: 'needs_review' }),
      incoming: { status: 'approved', sourceText: 'Hello' },
      locale: 'fr',
      actor: reviewer,
      settings: REVIEW_ON,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, status: 'approved', patch: { status: 'approved', reviewedBy: 4, reviewedAt: NOW } })
  })

  it('leaves an unchanged approval alone rather than re-approving it for the next person', () => {
    const result = evaluateTranslationWrite({
      current: stored(),
      incoming: { status: 'approved', sourceText: 'Hello' },
      locale: 'fr',
      actor: translator,
      settings: REVIEW_ON,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, status: 'approved' })
    expect(result.ok && 'reviewedBy' in result.patch).toBe(false)
  })

  it('does not let an approval survive a source change that nobody has re-approved', () => {
    const result = evaluateTranslationWrite({
      current: stored(),
      incoming: { sourceText: 'Hello, world' },
      locale: 'fr',
      actor: translator,
      settings: REVIEW_ON,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, status: 'needs_review' })
  })

  it('records a machine draft as a draft, not as an edit', () => {
    const result = evaluateTranslationWrite({
      current: null,
      incoming: { value: 'Bonjour', status: 'machine_draft', machineProvider: 'deepl' },
      locale: 'fr',
      actor: translator,
      settings: REVIEW_ON,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, status: 'machine_draft', patch: { status: 'machine_draft' } })
  })

  it('refuses a status clients may not set', () => {
    const result = evaluateTranslationWrite({ current: null, incoming: { status: 'missing' }, locale: 'fr', actor: admin, settings: settings(), now: NOW })
    expect(result).toMatchObject({ ok: false, code: 400 })
  })
})

describe('overview aggregation', () => {
  const items: OverviewItemInput[] = [
    {
      sourceKind: 'collection',
      sourceId: 'pages:7',
      type: 'pages',
      typeLabel: 'Pages',
      title: 'About us',
      updatedAt: '2026-10-20T00:00:00.000Z',
      editHref: '/admin/collections/pages/7',
      fields: [
        { fieldPath: 'title', label: 'Title', sourceText: 'About us' },
        { fieldPath: 'seo.metaDescription', label: 'SEO description', sourceText: 'Who we are' },
      ],
    },
    {
      sourceKind: 'interface',
      sourceId: 'ui',
      type: 'interface',
      typeLabel: 'Interface string',
      title: 'buy_now',
      updatedAt: null,
      editHref: null,
      fields: [{ fieldPath: 'buy_now', label: 'buy_now', sourceText: 'Buy now' }],
    },
  ]

  const row = (over: Partial<TranslationRow>): TranslationRow => ({
    id: 1,
    locale: 'fr',
    sourceKind: 'collection',
    sourceId: 'pages:7',
    fieldPath: 'title',
    value: 'À propos',
    sourceText: 'About us',
    status: 'approved',
    assignedTo: [],
    machineProvider: null,
    reviewedBy: 4,
    reviewedAt: null,
    ...over,
  })

  it('gives an item the least-finished status across its fields, and counts progress', () => {
    const rows = buildOverviewRows({
      items,
      stored: [row({ fieldPath: 'title' }), row({ id: 2, fieldPath: 'seo.metaDescription', value: 'Qui sommes-nous', status: 'needs_review' })],
      targetLocales: ['fr'],
      rules: RULES,
    })
    const about = rows.find((entry) => entry.title === 'About us')!
    expect(about.cells[0]).toMatchObject({ locale: 'fr', status: 'needs_review', approved: 1, total: 2 })
    expect(about.progress).toBe(50)
  })

  it('shows a field with no row as missing and assigns it to the language translators', () => {
    const rows = buildOverviewRows({ items, stored: [], targetLocales: ['fr'], rules: RULES })
    expect(statusOf(rows[0], 'fr')).toBe('missing')
    expect(rows[0].assignees).toEqual([2, 3])
  })

  it('finds the item key the same way the bulk route does', () => {
    expect(itemKey('collection', 'pages:7')).toBe('collection:pages:7')
  })

  it('filters by type, by language-and-status, by assignee and by search', () => {
    const rows = buildOverviewRows({ items, stored: [row({})], targetLocales: ['fr'], rules: RULES })
    const byType = filterOverviewRows(rows, [{ field: 'type', op: 'equals', value: 'interface' }], '', null)
    expect(byType.map((entry) => entry.title)).toEqual(['buy_now'])

    // "About us" has a field with no French yet, so it is missing in French too.
    const needing = filterOverviewRows(rows, [{ field: 'locale', op: 'equals', value: 'fr' }, { field: 'status', op: 'equals', value: 'missing' }], '', null)
    expect(needing.map((entry) => entry.title)).toEqual(['About us', 'buy_now'])

    const mine = filterOverviewRows(rows, [{ field: 'assignee', op: 'equals', value: 'me' }], '', 3)
    expect(mine.map((entry) => entry.title).sort()).toEqual(['About us', 'buy_now'])

    const search = filterOverviewRows(rows, [], 'about', null)
    expect(search.map((entry) => entry.title)).toEqual(['About us'])
  })

  it('sorts by the requested column, newest first by default, and pages within range', () => {
    const rows = buildOverviewRows({ items, stored: [], targetLocales: ['fr'], rules: RULES })
    expect(sortOverviewRows(rows, '-updatedAt')[0].title).toBe('About us')
    expect(sortOverviewRows(rows, 'title').map((entry) => entry.title)).toEqual(['About us', 'buy_now'])
    const page = pageOverviewRows(rows, 9, 1)
    expect(page).toMatchObject({ page: 2, totalPages: 2 })
  })

  it('offers one status column per language, and the defaults show them', () => {
    const columns = overviewColumns({ targetLocales: ['fr', 'de'], typeOptions: [], localeLabel: (code) => code.toUpperCase() })
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(['lang:fr', 'lang:de']))
    expect(OVERVIEW_DEFAULT_COLUMNS(['fr'])).toEqual(['title', 'type', 'lang:fr', 'progress', 'assignee', 'updatedAt'])
  })
})

describe('bulk request and notifications', () => {
  it('accepts an approve or assign request and rejects the rest', () => {
    expect(parseBulkBody({ action: 'approve', items: ['ui:buy_now'] }).ok).toBe(true)
    expect(parseBulkBody({ action: 'assign', items: ['ui:a'], assignees: [2] }).ok).toBe(true)
    expect(parseBulkBody({ action: 'delete', items: ['ui:a'] }).ok).toBe(false)
    expect(parseBulkBody({ action: 'approve', items: [] }).ok).toBe(false)
    expect(parseBulkBody({ action: 'approve', items: Array.from({ length: 101 }, (_, i) => `ui:${i}`) }).ok).toBe(false)
    expect(parseBulkBody(null).ok).toBe(false)
  })

  it('words the assignment email for one item or many', () => {
    expect(assignmentEmailText({ count: 1, locales: ['fr'] })).toContain('1 translation into fr')
    expect(assignmentEmailText({ count: 3, locales: [] })).toContain('3 translations.')
  })
})
