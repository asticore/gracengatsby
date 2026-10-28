// @vitest-environment node
// Builder translate mode, the pure rules: which text a canvas element stands for, the translated display copy,
// the per-block marks, Alt+arrow navigation, the status actions a text offers, and the structure lock. No React.
import { describe, expect, it } from 'vitest'

import type { DocumentTranslations, DocumentTranslationField } from '@/features/multilingual/documentTranslations'
import { computeTranslationStatus, evaluateTranslationWrite } from '@/features/multilingual/translationStatus'
import type { SectionNode } from '@/lib/sectionTree'
import {
  REQUEST_REVIEW_STATUS,
  blockPathsByKey,
  blockMarks,
  cellActions,
  fieldPathForElementText,
  firstFieldOfBlock,
  nextUntranslatedField,
  structureLockedInTranslate,
  textCellsFor,
  translatedBlocks,
  type CanvasTextCell,
} from '@/views/visualEditor/translateCanvas'

const blocks = [
  { id: 'h1', blockType: 'element', elementType: 'heading', props: { text: 'Hello' } },
  {
    id: 'sec',
    blockType: 'section',
    columns: [{ blocks: [{ id: 'hero1', blockType: 'hero', heading: 'Welcome', primaryCtaLabel: 'Start' }] }, { blocks: [] }],
  },
  { id: 'btn', blockType: 'element', elementType: 'button', props: { text: 'Buy now' } },
  { id: 'div', blockType: 'element', elementType: 'divider', props: {} },
  { blockType: 'element', elementType: 'heading', props: { text: 'No id' } },
] as unknown as SectionNode[]

const field = (partial: Partial<DocumentTranslationField> & Pick<DocumentTranslationField, 'fieldPath' | 'sourceText'>): DocumentTranslationField => ({
  label: 'Label',
  size: 'text',
  richText: false,
  value: '',
  rowId: null,
  status: 'missing',
  assignees: [],
  canApprove: true,
  group: null,
  ...partial,
})

const state: DocumentTranslations = {
  collection: 'pages',
  documentId: '4',
  sourceId: 'pages:4',
  defaultLocale: 'en',
  locales: [
    {
      locale: 'fr',
      approved: 1,
      total: 5,
      fields: [
        field({ fieldPath: 'blocks.h1.props.text', sourceText: 'Hello', value: 'Bonjour', rowId: 1, status: 'approved' }),
        field({ fieldPath: 'blocks.hero1.heading', sourceText: 'Welcome', value: 'Bienvenue', rowId: 2, status: 'machine_draft' }),
        field({ fieldPath: 'blocks.hero1.primaryCtaLabel', sourceText: 'Start', value: '', rowId: null, status: 'missing' }),
        field({ fieldPath: 'blocks.btn.props.text', sourceText: 'Buy now', value: 'Acheter', rowId: 3, status: 'needs_review' }),
        field({ fieldPath: 'blocks.hero1.richBody', sourceText: 'Rich', richText: true }),
      ],
    },
  ],
}

describe('element to field path mapping', () => {
  it('keys a block by its id, and a block with no id by its position', () => {
    const paths = blockPathsByKey(blocks)
    expect(paths.get('h1')).toEqual([0])
    expect(paths.get('sec')).toEqual([1])
    expect(paths.get('hero1')).toEqual([1, 0, 0])
    expect(paths.get('#4')).toEqual([4])
  })

  it('names an element heading text as blocks.<key>.props.<prop>', () => {
    expect(fieldPathForElementText('blocks', 'h1', 'text')).toBe('blocks.h1.props.text')
  })

  it('maps a click on a block to its first translatable row', () => {
    const cells = textCellsFor(state, 'fr')
    expect(firstFieldOfBlock(cells, 'hero1')).toBe('blocks.hero1.heading')
    expect(firstFieldOfBlock(cells, 'div')).toBeNull()
  })
})

describe('textCellsFor', () => {
  it('leaves rich text out and marks an empty text as untranslated', () => {
    const cells = textCellsFor(state, 'fr')
    expect(cells.map((c) => c.fieldPath)).not.toContain('blocks.hero1.richBody')
    expect(cells.find((c) => c.fieldPath === 'blocks.hero1.primaryCtaLabel')?.status).toBe('untranslated')
  })

  it('uses a live draft in place of the stored value', () => {
    const cells = textCellsFor(state, 'fr', { 'blocks.h1.props.text': 'Salut' })
    expect(cells.find((c) => c.fieldPath === 'blocks.h1.props.text')?.value).toBe('Salut')
  })
})

describe('translatedBlocks', () => {
  it('shows translated text, keeps source for untranslated text, and leaves the saved tree untouched', () => {
    const cells = textCellsFor(state, 'fr')
    const shown = translatedBlocks(blocks, cells, 'blocks') as unknown as Array<Record<string, unknown>>
    expect((shown[0] as { props: { text: string } }).props.text).toBe('Bonjour')
    const hero = ((shown[1] as { columns: Array<{ blocks: Array<Record<string, unknown>> }> }).columns[0] as { blocks: Array<Record<string, unknown>> }).blocks[0]
    expect(hero?.heading).toBe('Bienvenue')
    expect(hero?.primaryCtaLabel).toBe('Start')
    expect((blocks[0] as unknown as { props: { text: string } }).props.text).toBe('Hello')
  })

  it('returns the same tree when there is nothing to translate', () => {
    expect(translatedBlocks(blocks, [], 'blocks')).toBe(blocks)
  })
})

describe('blockMarks', () => {
  it('gives each block its worst status, its source text, and editability', () => {
    const marks = blockMarks(blocks, textCellsFor(state, 'fr'))
    expect(marks['0']).toEqual({ status: 'approved', source: 'Hello', editable: true })
    expect(marks['1.0.0']).toEqual({ status: 'untranslated', source: 'Welcome', editable: true })
    expect(marks['2']).toEqual({ status: 'needs_review', source: 'Buy now', editable: true })
    expect(marks['3']).toBeUndefined()
  })
})

describe('nextUntranslatedField', () => {
  const cells = textCellsFor(state, 'fr')
  it('moves forward to the next untranslated text and wraps', () => {
    expect(nextUntranslatedField(cells, null, 1)).toBe('blocks.hero1.primaryCtaLabel')
    expect(nextUntranslatedField(cells, 'blocks.hero1.primaryCtaLabel', 1)).toBe('blocks.hero1.primaryCtaLabel')
  })

  it('moves backward and wraps to the last one', () => {
    expect(nextUntranslatedField(cells, 'blocks.h1.props.text', -1)).toBe('blocks.hero1.primaryCtaLabel')
  })

  it('returns null when every text is translated', () => {
    const done = cells.map((c) => ({ ...c, status: 'approved' as const }))
    expect(nextUntranslatedField(done, null, 1)).toBeNull()
  })
})

describe('translate mode lock', () => {
  it('locks structure and property edits while translating, and not otherwise', () => {
    expect(structureLockedInTranslate(true)).toBe(true)
    expect(structureLockedInTranslate(false)).toBe(false)
  })
})

describe('status actions', () => {
  const base: Pick<CanvasTextCell, 'value' | 'sourceText' | 'canApprove'> = { value: 'Texte', sourceText: 'Text', canApprove: true }

  it('offers approve only for a reviewer with text that is not yet approved', () => {
    expect(cellActions({ ...base, status: 'needs_review' })).toContain('approve')
    expect(cellActions({ ...base, status: 'approved' })).not.toContain('approve')
    expect(cellActions({ ...base, status: 'needs_review', canApprove: false })).not.toContain('approve')
  })

  it('offers copy source only for an untranslated text that has source', () => {
    expect(cellActions({ value: '', sourceText: 'Text', canApprove: true, status: 'untranslated' })).toContain('copySource')
    expect(cellActions({ value: '', sourceText: '  ', canApprove: true, status: 'untranslated' })).not.toContain('copySource')
    expect(cellActions({ ...base, status: 'machine_draft' })).not.toContain('copySource')
  })

  it('always offers machine translate, and request review only for text that is written', () => {
    expect(cellActions({ value: '', sourceText: 'Text', canApprove: false, status: 'untranslated' })).toEqual(['copySource', 'machineTranslate'])
    expect(cellActions({ ...base, status: 'needs_review' })).not.toContain('requestReview')
    expect(cellActions({ ...base, status: 'approved' })).toContain('requestReview')
  })

  it('request review leaves the text needs_review on the server, and approval is refused for a non-reviewer', () => {
    const settings = {
      requireReview: true,
      adminsBypassReview: false,
      translationRules: { fr: { translators: [7], reviewers: [9] } },
    } as never
    const review = evaluateTranslationWrite({
      current: { value: 'Texte', status: 'approved', sourceText: 'Text' },
      incoming: { status: REQUEST_REVIEW_STATUS, value: 'Texte', sourceText: 'Text' },
      locale: 'fr',
      actor: { id: 7, isAdmin: false },
      settings,
      now: '2026-10-28T00:00:00Z',
    })
    expect(review).toMatchObject({ ok: true, status: 'needs_review' })

    const refused = evaluateTranslationWrite({
      current: { value: 'Texte', status: 'needs_review', sourceText: 'Text' },
      incoming: { status: 'approved', value: 'Texte', sourceText: 'Text' },
      locale: 'fr',
      actor: { id: 7, isAdmin: false },
      settings,
      now: '2026-10-28T00:00:00Z',
    })
    expect(refused).toMatchObject({ ok: false, code: 403 })
    expect(computeTranslationStatus({ value: 'x', status: 'needs_review', sourceText: 'a' }, 'b')).toBe('needs_review')
  })
})
