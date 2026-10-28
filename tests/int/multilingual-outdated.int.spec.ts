// @vitest-environment node
// Save-time staleness: which stored translations a source edit marks needs_review.
// Pure - the planner takes rows and the current source text, no engine.
import { describe, expect, it } from 'vitest'

import { planOutdatedMarks } from '@/features/multilingual/outdated'
import type { TranslationRow } from '@/features/multilingual/store'
import type { TranslationRules } from '@/features/multilingual/translationStatus'

const RULES: TranslationRules = { fr: { translators: [2], reviewers: [4] } }

const row = (overrides: Partial<TranslationRow>): TranslationRow => ({
  id: 1,
  locale: 'fr',
  sourceKind: 'collection',
  sourceId: 'pages:7',
  fieldPath: 'title',
  value: 'Bonjour',
  sourceText: 'Hello',
  status: 'approved',
  assignedTo: [],
  machineProvider: null,
  reviewedBy: null,
  reviewedAt: null,
  ...overrides,
})

describe('planOutdatedMarks', () => {
  it('marks a row whose snapshot differs from the current source', () => {
    const marks = planOutdatedMarks({
      rows: [row({})],
      current: new Map([['title', 'Hello there']]),
      rules: RULES,
    })
    expect(marks.map((m) => m.id)).toEqual([1])
  })

  it('leaves a row alone when the source is unchanged', () => {
    expect(planOutdatedMarks({ rows: [row({})], current: new Map([['title', 'Hello']]), rules: RULES })).toEqual([])
  })

  it('leaves a row alone when it is already needs_review', () => {
    expect(
      planOutdatedMarks({ rows: [row({ status: 'needs_review' })], current: new Map([['title', 'Changed']]), rules: RULES }),
    ).toEqual([])
  })

  it('skips rows with no snapshot or no translated text', () => {
    const marks = planOutdatedMarks({
      rows: [row({ id: 1, sourceText: null }), row({ id: 2, value: '' }), row({ id: 3, value: '   ' })],
      current: new Map([['title', 'Changed']]),
      rules: RULES,
    })
    expect(marks).toEqual([])
  })

  it('does not mark a field that no longer exists; that is inactive, not outdated', () => {
    expect(planOutdatedMarks({ rows: [row({ fieldPath: 'gone' })], current: new Map([['title', 'x']]), rules: RULES })).toEqual([])
  })

  it('never touches interface or global rows', () => {
    const marks = planOutdatedMarks({
      rows: [row({ sourceKind: 'interface' }), row({ sourceKind: 'global', id: 2 })],
      current: new Map([['title', 'Changed']]),
      rules: RULES,
    })
    expect(marks).toEqual([])
  })

  it('names the language rules reviewers for a stale row, and the item override when set', () => {
    const [byRules] = planOutdatedMarks({ rows: [row({ id: 1 })], current: new Map([['title', 'Changed']]), rules: RULES })
    expect(byRules.assignees).toEqual([4])

    const [byItem] = planOutdatedMarks({
      rows: [row({ id: 2, assignedTo: [9] })],
      current: new Map([['title', 'Changed']]),
      rules: RULES,
    })
    expect(byItem.assignees).toEqual([9])
  })

  it('marks several rows of one document in one pass, across locales and fields', () => {
    const marks = planOutdatedMarks({
      rows: [
        row({ id: 1, fieldPath: 'title' }),
        row({ id: 2, locale: 'de', fieldPath: 'title' }),
        row({ id: 3, fieldPath: 'excerpt', sourceText: 'Old', value: 'Vieux' }),
        row({ id: 4, fieldPath: 'seo.metaTitle', sourceText: 'Same', value: 'Same fr' }),
      ],
      current: new Map([
        ['title', 'New title'],
        ['excerpt', 'New'],
        ['seo.metaTitle', 'Same'],
      ]),
      rules: RULES,
    })
    expect(marks.map((m) => m.id).sort()).toEqual([1, 2, 3])
  })
})
