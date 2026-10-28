// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import type { MultilingualSettings } from '@/features/multilingual/settings'
import { DEFAULT_MULTILINGUAL_SETTINGS } from '@/features/multilingual/settings'
import { decideFieldDraft, runMachineDrafts, type DraftItem } from '@/features/multilingual/machine/drafts'
import { autoDraftDocument, draftItemsForDocument } from '@/features/multilingual/machine/autoDraft'
import { parseBulkBody, MAX_BULK_ITEMS } from '@/features/multilingual/translationActions'
import { isTranslationPublishable } from '@/features/multilingual/translationStatus'
import type { TranslationRow } from '@/features/multilingual/store'
import type { UsageD1 } from '@/features/multilingual/machine/usage'

const KEY = 'g-key-xyz'

const row = (over: Partial<TranslationRow> = {}): TranslationRow => ({
  id: 7,
  locale: 'fr',
  sourceKind: 'collection',
  sourceId: 'pages:1',
  fieldPath: 'title',
  value: 'Bonjour',
  sourceText: 'Hello',
  status: 'machine_draft',
  assignedTo: [],
  machineProvider: 'google',
  reviewedBy: null,
  reviewedAt: null,
  ...over,
})

const item = (over: Partial<DraftItem> = {}): DraftItem => ({
  sourceKind: 'collection',
  sourceId: 'pages:1',
  fields: [{ fieldPath: 'title', sourceText: 'Hello' }],
  ...over,
})

const settingsWith = (over: Partial<MultilingualSettings> = {}, machine: Partial<MultilingualSettings['machine']> = {}): MultilingualSettings => ({
  ...DEFAULT_MULTILINGUAL_SETTINGS,
  enabled: true,
  activeLocales: ['en', 'fr'],
  defaultLocale: 'en',
  machine: { enabled: true, defaultProvider: 'google', overrides: {}, monthlyCharLimit: 0, autoDraft: false, ...machine },
  ...over,
})

function fakeFetch(texts: (q: string[]) => string[]) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const q = JSON.parse(String(init.body)).q as string[]
    return new Response(JSON.stringify({ data: { translations: texts(q).map((t) => ({ translatedText: t })) } }), { status: 200 })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

function fakeD1(state: { chars?: number; writes: unknown[][] }): UsageD1 {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async <T,>() => ({ results: (/SUM\(chars\)/.test(sql) ? [{ chars: state.chars ?? 0 }] : []) as T[] }),
        run: async () => {
          if (/INSERT INTO eg_machine_translation_usage/.test(sql)) state.writes.push(args)
          return {}
        },
      }),
    }),
  } as unknown as UsageD1
}

function fakeEngine() {
  const creates: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  return {
    creates,
    updates,
    engine: {
      findGlobal: vi.fn(async ({ slug }: { slug: string }) =>
        slug === 'integrations' ? { translation: { googleApiKey: KEY, deeplApiKey: null, deeplPlan: 'auto' }, claudeApiKey: null, aiMonthlyCapUsd: 0 } : {},
      ),
      create: vi.fn(async (args: Record<string, unknown>) => {
        creates.push(args)
        return {}
      }),
      update: vi.fn(async (args: Record<string, unknown>) => {
        updates.push(args)
        return {}
      }),
    },
  }
}

describe('decideFieldDraft (what a machine draft may replace)', () => {
  it('drafts a missing or empty field', () => {
    expect(decideFieldDraft({ row: null, sourceText: 'Hello', overwrite: false })).toBe('draft')
    expect(decideFieldDraft({ row: row({ value: '  ' }), sourceText: 'Hello', overwrite: false })).toBe('draft')
  })

  it('keeps approved text unless overwrite is set', () => {
    const approved = row({ status: 'approved', machineProvider: null })
    expect(decideFieldDraft({ row: approved, sourceText: 'Hello', overwrite: false })).toBe('approved')
    expect(decideFieldDraft({ row: approved, sourceText: 'Hello', overwrite: true })).toBe('draft')
  })

  it('keeps text a person wrote, even while it waits for review', () => {
    expect(decideFieldDraft({ row: row({ machineProvider: null, status: 'needs_review' }), sourceText: 'Hello', overwrite: false })).toBe('human')
    expect(decideFieldDraft({ row: row({ status: 'needs_review' }), sourceText: 'Hello', overwrite: false })).toBe('human')
  })

  it('leaves an unchanged machine draft alone and redrafts one whose source moved on', () => {
    expect(decideFieldDraft({ row: row(), sourceText: 'Hello', overwrite: false })).toBe('unchanged')
    expect(decideFieldDraft({ row: row(), sourceText: 'Hello there', overwrite: false })).toBe('draft')
  })
})

describe('parseBulkBody (translate action)', () => {
  it('accepts translate with overwrite and a provider', () => {
    const parsed = parseBulkBody({ action: 'translate', items: ['pages:1'], overwrite: true, provider: 'deepl' })
    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ action: 'translate', overwrite: true, provider: 'deepl' }) })
  })

  it('caps a translate request at MAX_BULK_ITEMS items', () => {
    expect(MAX_BULK_ITEMS).toBe(100)
    const items = Array.from({ length: 101 }, (_, i) => `pages:${i}`)
    expect(parseBulkBody({ action: 'translate', items })).toMatchObject({ ok: false })
    expect(parseBulkBody({ action: 'translate', items: items.slice(0, 100) })).toMatchObject({ ok: true })
  })

  it('rejects an unknown provider and a non-boolean overwrite', () => {
    expect(parseBulkBody({ action: 'translate', items: ['a'], provider: 'bing' })).toMatchObject({ ok: false })
    expect(parseBulkBody({ action: 'translate', items: ['a'], overwrite: 'yes' })).toMatchObject({ ok: false })
  })
})

describe('runMachineDrafts (status outcome and review rules)', () => {
  it('writes a new draft as machine_draft with its provider, and it is shown only when review is off', async () => {
    const f = fakeFetch((q) => q.map((t) => `FR:${t}`))
    const { engine, creates } = fakeEngine()
    const state = { writes: [] as unknown[][] }
    const result = await runMachineDrafts({
      engine: engine as never,
      user: null,
      items: [item()],
      locales: ['fr'],
      stored: [],
      overwrite: false,
      settings: settingsWith(),
      d1: fakeD1(state),
      deps: { fetch: f.fetch },
    })
    expect(result).toEqual({ updated: 1, skipped: 0, refused: [] })
    expect(creates[0]).toMatchObject({
      collection: 'translations',
      overrideAccess: true,
      data: expect.objectContaining({ locale: 'fr', sourceId: 'pages:1', fieldPath: 'title', value: 'FR:Hello', status: 'machine_draft', machineProvider: 'google', sourceText: 'Hello' }),
    })
    const stored = { status: 'machine_draft' as const, value: 'FR:Hello', sourceText: 'Hello' }
    expect(isTranslationPublishable(stored, { requireReview: false })).toBe(true)
    expect(isTranslationPublishable(stored, { requireReview: true })).toBe(false)
  })

  it('leaves approved text alone and overwrites it only when asked', async () => {
    const approved = row({ status: 'approved', machineProvider: null, value: 'Salut' })
    const f = fakeFetch((q) => q.map((t) => `FR:${t}`))
    const { engine, updates } = fakeEngine()
    const base = { engine: engine as never, user: { id: 3 }, items: [item()], locales: ['fr'], stored: [approved], settings: settingsWith(), d1: fakeD1({ writes: [] }), deps: { fetch: f.fetch } }
    const kept = await runMachineDrafts({ ...base, overwrite: false })
    expect(kept.updated).toBe(0)
    expect(kept.skipped).toBe(1)
    expect(f.fetch).not.toHaveBeenCalled()
    const replaced = await runMachineDrafts({ ...base, overwrite: true })
    expect(replaced.updated).toBe(1)
    expect(updates[0]).toMatchObject({ id: 7, overrideAccess: false, user: { id: 3 }, data: expect.objectContaining({ status: 'machine_draft', value: 'FR:Hello', machineProvider: 'google' }) })
  })

  it('refuses over the monthly limit: no provider call and nothing written', async () => {
    const f = fakeFetch((q) => q)
    const { engine, creates, updates } = fakeEngine()
    const result = await runMachineDrafts({
      engine: engine as never,
      user: null,
      items: [item({ fields: [{ fieldPath: 'title', sourceText: 'x'.repeat(50) }] })],
      locales: ['fr'],
      stored: [],
      overwrite: false,
      settings: settingsWith({}, { monthlyCharLimit: 20 }),
      d1: fakeD1({ chars: 0, writes: [] }),
      deps: { fetch: f.fetch },
    })
    expect(result.updated).toBe(0)
    expect(result.refused[0]).toMatch(/^fr: This would go over the monthly limit/)
    expect(f.fetch).not.toHaveBeenCalled()
    expect(creates).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('reports a provider failure per language and keeps the existing translation', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
    const { engine, creates, updates } = fakeEngine()
    const result = await runMachineDrafts({
      engine: engine as never,
      user: null,
      items: [item()],
      locales: ['fr'],
      stored: [row({ status: 'machine_draft' })],
      overwrite: true,
      settings: settingsWith(),
      d1: fakeD1({ writes: [] }),
      deps: { fetch: f },
    })
    expect(result.updated).toBe(0)
    expect(result.refused[0]).toMatch(/^fr: Google Cloud Translation rejected the API key/)
    expect(creates).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })
})

describe('auto-draft on save', () => {
  const doc = { id: 1, title: 'Hello', meta: { title: '', description: '' }, excerpt: '' }

  it('builds draft items only from non-empty translatable fields', () => {
    expect(draftItemsForDocument('pages', doc)).toEqual([
      { sourceKind: 'collection', sourceId: 'pages:1', fields: [{ fieldPath: 'title', sourceText: 'Hello' }] },
    ])
    expect(draftItemsForDocument('not-translatable', doc)).toEqual([])
  })

  it('does nothing when the switch is off (the default), with no provider call and no writes', async () => {
    const f = fakeFetch((q) => q)
    const { engine, creates } = fakeEngine()
    await autoDraftDocument({ engine: { ...engine, find: vi.fn(async () => ({ docs: [] })) } as never, slug: 'pages', doc, settings: settingsWith({}, { autoDraft: false }) })
    expect(f.fetch).not.toHaveBeenCalled()
    expect(creates).toHaveLength(0)
  })

  it('drafts the changed fields when on, under the same review rules', async () => {
    const f = fakeFetch((q) => q.map((t) => `FR:${t}`))
    const { engine, creates } = fakeEngine()
    const find = vi.fn(async () => ({ docs: [] }))
    await autoDraftDocument({
      engine: { ...engine, find } as never,
      slug: 'pages',
      doc,
      settings: settingsWith({}, { autoDraft: true }),
      d1: fakeD1({ writes: [] }),
      deps: { fetch: f.fetch },
    })
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(creates).toHaveLength(1)
    expect(creates[0]).toMatchObject({ overrideAccess: true, data: expect.objectContaining({ status: 'machine_draft', machineProvider: 'google' }) })
  })

  it('never throws into the save, even when the engine fails', async () => {
    const engine = { find: vi.fn(async () => { throw new Error('boom') }), findGlobal: vi.fn(), create: vi.fn(), update: vi.fn() }
    await expect(
      autoDraftDocument({ engine: engine as never, slug: 'pages', doc, settings: settingsWith({}, { autoDraft: true }) }),
    ).resolves.toBeUndefined()
  })
})
