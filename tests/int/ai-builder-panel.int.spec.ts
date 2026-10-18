import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SectionNode } from '@/lib/sectionTree'
import {
  addOutlineItem,
  AI_LIMITS,
  AiBuilderError,
  buildAiRequest,
  cleanExamples,
  collectSubtree,
  connectedProviders,
  effectiveMode,
  fetchAiProviders,
  moveOutlineItem,
  normaliseBuild,
  normaliseOutline,
  normalisePlan,
  normaliseProviders,
  pickProvider,
  postAiBuilder,
  removeOutlineItem,
  stripIdKeys,
  updateOutlineItem,
  validateBrief,
  validateOutline,
} from '@/views/visualEditor/aiBuilderState'
import { nextFocusIndex } from '@/views/visualEditor/EditorDock'

afterEach(() => {
  vi.unstubAllGlobals()
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('provider handling', () => {
  it('reads the providers map and defaults missing keys to false', () => {
    expect(normaliseProviders({ providers: { claude: true, openai: false } })).toEqual({ claude: true, openai: false })
    expect(normaliseProviders({ providers: { claude: true } })).toEqual({ claude: true, openai: false })
    expect(normaliseProviders({ nope: true })).toBeNull()
    expect(normaliseProviders(null)).toBeNull()
  })

  it('lists only connected providers in display order, and picks a valid default', () => {
    expect(connectedProviders({ claude: false, openai: true })).toEqual(['openai'])
    expect(connectedProviders({ claude: true, openai: true })).toEqual(['claude', 'openai'])
    expect(connectedProviders({ claude: false, openai: false })).toEqual([])
    expect(connectedProviders(null)).toEqual([])
    expect(pickProvider('openai', ['claude', 'openai'])).toBe('openai')
    expect(pickProvider('openai', ['claude'])).toBe('claude')
    expect(pickProvider('claude', [])).toBeNull()
  })
})

describe('request building', () => {
  it('trims the brief and leaves out empty optional fields', () => {
    const body = buildAiRequest('plan', {
      provider: 'claude',
      mode: 'section',
      brief: '  Hero section  ',
      examples: ['  ', ''],
      answers: [{ q: 'Tone?', a: '  ' }],
    })
    expect(body).toEqual({ action: 'plan', provider: 'claude', mode: 'section', brief: 'Hero section' })
    expect(body).not.toHaveProperty('examples')
    expect(body).not.toHaveProperty('answers')
    expect(body).not.toHaveProperty('outline')
    expect(body).not.toHaveProperty('selection')
  })

  it('keeps examples and answers, capped at the example limit', () => {
    const body = buildAiRequest('plan', {
      provider: 'openai',
      mode: 'page',
      brief: 'Landing page',
      examples: ['a', 'b', 'c', 'd'],
      answers: [{ q: ' Audience? ', a: ' Parents ' }],
      pageTitle: '  Summer  ',
    })
    expect(body.examples).toEqual(['a', 'b', 'c'])
    expect(body.answers).toEqual([{ q: 'Audience?', a: 'Parents' }])
    expect(body.pageTitle).toBe('Summer')
  })

  it('sends the outline only with build, and trims its items', () => {
    const outline = [{ title: ' Intro ', summary: ' Short ' }]
    expect(buildAiRequest('plan', { provider: 'claude', mode: 'section', brief: 'x', outline }).outline).toBeUndefined()
    expect(buildAiRequest('build', { provider: 'claude', mode: 'section', brief: 'x', outline }).outline).toEqual([
      { title: 'Intro', summary: 'Short' },
    ])
  })

  it('sends the selection without editor ids, and only in edit mode', () => {
    const selection = { blockType: 'section', _id: 'sec-1', columns: [{ _id: 'col-1', blocks: [{ blockType: 'richText', _id: 'rt-1' }] }] }
    const edit = buildAiRequest('build', { provider: 'claude', mode: 'edit', brief: 'Make it bolder', selection })
    expect(edit.selection).toEqual({ blockType: 'section', columns: [{ blocks: [{ blockType: 'richText' }] }] })
    const section = buildAiRequest('build', { provider: 'claude', mode: 'section', brief: 'New', selection })
    expect(section).not.toHaveProperty('selection')
  })
})

describe('limits', () => {
  it('validates the brief length and emptiness', () => {
    expect(validateBrief('   ')).toMatch(/Describe/)
    expect(validateBrief('ok')).toBeNull()
    expect(validateBrief('x'.repeat(AI_LIMITS.brief))).toBeNull()
    expect(validateBrief('x'.repeat(AI_LIMITS.brief + 1))).toMatch(/under 4000/)
  })

  it('caps examples at three and drops blank ones', () => {
    expect(cleanExamples(['one', ' ', 'two', 'three', 'four'])).toEqual(['one', 'two', 'three'])
  })

  it('falls back from edit mode when no section is selected', () => {
    expect(effectiveMode('edit', false)).toBe('section')
    expect(effectiveMode('edit', true)).toBe('edit')
    expect(effectiveMode('page', false)).toBe('page')
  })
})

describe('response normalising', () => {
  it('returns questions from a plan response', () => {
    expect(normalisePlan({ ok: true, questions: [' Who is it for? ', ''] })).toEqual({ kind: 'questions', questions: ['Who is it for?'] })
  })

  it('returns a cleaned outline from a plan response', () => {
    const result = normalisePlan({
      ok: true,
      outline: [{ title: ' Hero ', summary: 'Big' }, { summary: 'no title' }, 'junk'],
    })
    expect(result).toEqual({ kind: 'outline', outline: [{ title: 'Hero', summary: 'Big' }] })
  })

  it('throws AiBuilderError with the server message on failure', () => {
    expect(() => normalisePlan({ ok: false, error: 'Key rejected' })).toThrow(AiBuilderError)
    expect(() => normalisePlan({ ok: false, error: 'Key rejected' })).toThrow('Key rejected')
    expect(() => normalisePlan({ ok: true, questions: [] })).toThrow(AiBuilderError)
    expect(() => normalisePlan({ ok: true, outline: [] })).toThrow(/empty outline/)
  })

  it('returns sections and warnings from a build response, dropping malformed sections', () => {
    const result = normaliseBuild({
      ok: true,
      sections: [{ blockType: 'section', columns: [] }, { nope: true }],
      warnings: ['Unknown effect removed', '', 4],
    })
    expect(result.sections).toEqual([{ blockType: 'section', columns: [] }])
    expect(result.warnings).toEqual(['Unknown effect removed'])
  })

  it('throws when a build response has no usable section', () => {
    expect(() => normaliseBuild({ ok: true, sections: [], warnings: [] })).toThrow(/did not return any sections/)
    expect(() => normaliseBuild({ ok: false, error: 'Too long' }, 422)).toThrow('Too long')
  })

  it('uses a status message when the error body has no error text', () => {
    expect(() => normalisePlan(null, 500)).toThrow('The AI request failed (HTTP 500).')
  })

  it('normaliseOutline caps the number of items', () => {
    const many = Array.from({ length: AI_LIMITS.outlineItems + 5 }, (_v, i) => ({ title: `T${i}`, summary: '' }))
    expect(normaliseOutline(many)).toHaveLength(AI_LIMITS.outlineItems)
  })
})

describe('outline editing', () => {
  const base = [
    { title: 'A', summary: '' },
    { title: 'B', summary: '' },
    { title: 'C', summary: '' },
  ]

  it('moves items up and down and ignores moves past the ends', () => {
    expect(moveOutlineItem(base, 2, -1).map((i) => i.title)).toEqual(['A', 'C', 'B'])
    expect(moveOutlineItem(base, 0, 1).map((i) => i.title)).toEqual(['B', 'A', 'C'])
    expect(moveOutlineItem(base, 0, -1).map((i) => i.title)).toEqual(['A', 'B', 'C'])
    expect(moveOutlineItem(base, 2, 1).map((i) => i.title)).toEqual(['A', 'B', 'C'])
  })

  it('edits one item without touching the others', () => {
    const next = updateOutlineItem(base, 1, { summary: 'Details' })
    expect(next[1]).toEqual({ title: 'B', summary: 'Details' })
    expect(next[0]).toBe(base[0])
    expect(base[1].summary).toBe('')
  })

  it('removes an item and adds blank items up to the limit', () => {
    expect(removeOutlineItem(base, 1).map((i) => i.title)).toEqual(['A', 'C'])
    expect(addOutlineItem(base)).toHaveLength(4)
    const full = Array.from({ length: AI_LIMITS.outlineItems }, () => ({ title: 'x', summary: '' }))
    expect(addOutlineItem(full)).toHaveLength(AI_LIMITS.outlineItems)
  })

  it('requires at least one item and a title on every item', () => {
    expect(validateOutline([])).toMatch(/at least one/)
    expect(validateOutline([{ title: ' ', summary: '' }])).toMatch(/needs a title/)
    expect(validateOutline(base)).toBeNull()
  })
})

describe('selection helpers', () => {
  it('strips _id keys at every depth', () => {
    expect(stripIdKeys({ _id: 'a', columns: [{ _id: 'b', blocks: [{ _id: 'c', blockType: 'x' }] }] })).toEqual({
      columns: [{ blocks: [{ blockType: 'x' }] }],
    })
  })

  it('collects a section and everything nested in it', () => {
    const section = {
      blockType: 'section',
      _id: 's',
      columns: [
        { _id: 'c1', blocks: [{ blockType: 'richText', _id: 'r' }, { blockType: 'section', _id: 'inner', columns: [] }] },
      ],
    } as unknown as SectionNode
    expect(collectSubtree(section).map((node) => node._id)).toEqual(['s', 'r', 'inner'])
  })
})

describe('API calls', () => {
  it('GETs the providers with same-origin credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ providers: { claude: true, openai: false } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchAiProviders()).resolves.toEqual({ claude: true, openai: false })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin-ai-builder')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
  })

  it('surfaces provider load errors as AiBuilderError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'Sign in again' }, 401)))
    await expect(fetchAiProviders()).rejects.toThrow('Sign in again')
  })

  it('POSTs JSON and returns the parsed body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, questions: ['Tone?'] }))
    vi.stubGlobal('fetch', fetchMock)
    const body = buildAiRequest('plan', { provider: 'claude', mode: 'section', brief: 'Hero' })
    const data = await postAiBuilder(body)
    expect(data).toEqual({ ok: true, questions: ['Tone?'] })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(String(init.body))).toEqual(body)
  })

  it('throws AiBuilderError for non-2xx and for ok:false bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'Rate limited' }, 429)))
    await expect(postAiBuilder(buildAiRequest('build', { provider: 'openai', mode: 'page', brief: 'x' }))).rejects.toThrow('Rate limited')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'Nope' }, 200)))
    await expect(postAiBuilder(buildAiRequest('build', { provider: 'openai', mode: 'page', brief: 'x' }))).rejects.toBeInstanceOf(AiBuilderError)
  })
})

describe('Build with AI dialog focus trap', () => {
  it('moves forward through the dialog and wraps from the last item to the first', () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1)
    expect(nextFocusIndex(1, 3, false)).toBe(2)
    expect(nextFocusIndex(2, 3, false)).toBe(0)
  })

  it('moves backward and wraps from the first item to the last', () => {
    expect(nextFocusIndex(2, 3, true)).toBe(1)
    expect(nextFocusIndex(0, 3, true)).toBe(2)
  })

  it('starts from the first item on Tab and the last on Shift+Tab when focus sits on the dialog itself', () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0)
    expect(nextFocusIndex(-1, 3, true)).toBe(2)
  })

  it('returns -1 when there is nothing to focus', () => {
    expect(nextFocusIndex(-1, 0, false)).toBe(-1)
    expect(nextFocusIndex(0, 0, true)).toBe(-1)
  })
})
