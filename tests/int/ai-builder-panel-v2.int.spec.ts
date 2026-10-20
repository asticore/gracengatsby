import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  addSavedPrompt,
  AI_CHECKING_AFTER_SECONDS,
  AI_HISTORY_MAX,
  AI_HISTORY_TEXT_MAX,
  AI_LIMITS,
  AiBuilderError,
  deleteSavedPrompt,
  fetchAiStatus,
  fetchTemplateExamples,
  loadSavedPrompts,
  normaliseMediaPlaceholders,
  normaliseTemplateExamples,
  normaliseUsage,
  progressText,
  sanitiseSavedPrompts,
  SAVED_PROMPTS_KEY,
  SAVED_PROMPTS_MAX,
  type SavedPrompt,
  stageLabel,
  storeSavedPrompts,
  templateExampleText,
  trimHistory,
  type AiUsage,
  usageText,
  usageWarning,
} from '@/views/visualEditor/aiBuilderState'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  try {
    window.localStorage.clear()
  } catch {
    // jsdom always provides localStorage; ignore if a test replaced it
  }
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const usage = (overrides: Partial<AiUsage> = {}): AiUsage => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  estCostUsd: 0,
  capUsd: 10,
  ...overrides,
})

const prompt = (id: string, name: string, brief = `brief for ${id}`): SavedPrompt => ({ id, name, brief })

/** In-memory stand-in for the parts of Storage the helpers use. */
const memoryStorage = (initial: Record<string, string> = {}) => {
  const data: Record<string, string> = { ...initial }
  return {
    data,
    getItem: (key: string): string | null => (key in data ? data[key] : null),
    setItem: (key: string, value: string): void => {
      data[key] = value
    },
  }
}

const throwingStorage = () => ({
  getItem: (): string | null => {
    throw new Error('storage blocked')
  },
  setItem: (): void => {
    throw new Error('quota exceeded')
  },
})

describe('trimHistory', () => {
  it('returns an empty list for null, undefined or an empty input', () => {
    expect(trimHistory(null)).toEqual([])
    expect(trimHistory(undefined)).toEqual([])
    expect(trimHistory([])).toEqual([])
  })

  it('drops non-object entries, arrays, unknown roles and blank text', () => {
    const out = trimHistory([
      'hello',
      null,
      ['user', 'x'],
      { role: 'system', text: 'nope' },
      { role: 'user', text: '   ' },
      { role: 'user' },
      { role: 'assistant', text: 42 },
      { role: 'user', text: ' kept ' },
    ])
    expect(out).toEqual([{ role: 'user', text: 'kept' }])
  })

  it('trims text and caps it at AI_HISTORY_TEXT_MAX characters', () => {
    const out = trimHistory([{ role: 'assistant', text: `  ${'x'.repeat(AI_HISTORY_TEXT_MAX + 500)}  ` }])
    expect(out).toHaveLength(1)
    expect(out[0].text).toHaveLength(AI_HISTORY_TEXT_MAX)
    expect(out[0].role).toBe('assistant')
  })

  it('keeps only the newest AI_HISTORY_MAX entries by default', () => {
    const entries = Array.from({ length: AI_HISTORY_MAX + 2 }, (_v, i) => ({ role: 'user', text: `m${i}` }))
    const out = trimHistory(entries)
    expect(out).toHaveLength(AI_HISTORY_MAX)
    expect(out[0].text).toBe('m2')
    expect(out[out.length - 1].text).toBe(`m${AI_HISTORY_MAX + 1}`)
  })

  it('honours an explicit max and keeps order', () => {
    const out = trimHistory(
      [
        { role: 'user', text: 'a' },
        { role: 'assistant', text: 'b' },
        { role: 'user', text: 'c' },
        { role: 'assistant', text: 'd' },
      ],
      2,
    )
    expect(out).toEqual([
      { role: 'user', text: 'c' },
      { role: 'assistant', text: 'd' },
    ])
  })

  it('returns nothing when max is 0 (zero entries kept, not unlimited)', () => {
    expect(trimHistory([{ role: 'user', text: 'a' }], 0)).toEqual([])
  })

  it('applies the cap after dropping invalid entries', () => {
    const out = trimHistory(
      [
        { role: 'user', text: 'old' },
        { role: 'user', text: '' },
        { role: 'assistant', text: 'new' },
      ],
      1,
    )
    expect(out).toEqual([{ role: 'assistant', text: 'new' }])
  })
})

describe('normaliseUsage', () => {
  it('returns null when the usage block is absent or the response is not an object', () => {
    expect(normaliseUsage({})).toBeNull()
    expect(normaliseUsage({ usage: 'nope' })).toBeNull()
    expect(normaliseUsage(null)).toBeNull()
    expect(normaliseUsage('usage')).toBeNull()
  })

  it('reads the numbers from a well-formed block', () => {
    expect(
      normaliseUsage({ usage: { calls: 3, inputTokens: 1200, outputTokens: 450, estCostUsd: 1.5, capUsd: 10 } }),
    ).toEqual({ calls: 3, inputTokens: 1200, outputTokens: 450, estCostUsd: 1.5, capUsd: 10 })
  })

  it('turns negative, non-numeric and non-finite values into 0', () => {
    const out = normaliseUsage({
      usage: { calls: -2, inputTokens: '12', outputTokens: Number.NaN, estCostUsd: Infinity, capUsd: null },
    })
    expect(out).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, estCostUsd: 0, capUsd: 0 })
  })

  it('floors the call count', () => {
    expect(normaliseUsage({ usage: { calls: 2.9 } })?.calls).toBe(2)
  })
})

describe('usageText', () => {
  it('returns an empty string when there is no usage', () => {
    expect(usageText(null)).toBe('')
    expect(usageText(undefined)).toBe('')
  })

  it('shows builds, estimated cost and the cap', () => {
    expect(usageText(usage({ calls: 12, estCostUsd: 1.2, capUsd: 10 }))).toBe('This month: 12 builds, ~$1.20 of $10.00')
  })

  it('uses the singular for exactly one build and the plural otherwise', () => {
    expect(usageText(usage({ calls: 1, estCostUsd: 0.5 }))).toContain('1 build,')
    expect(usageText(usage({ calls: 0, estCostUsd: 0 }))).toContain('0 builds,')
  })

  it('leaves the cap out when capUsd is 0 (no cap)', () => {
    expect(usageText(usage({ calls: 3, estCostUsd: 1.2, capUsd: 0 }))).toBe('This month: 3 builds, ~$1.20')
  })

  it('shows whole dollars once the amount reaches 100', () => {
    expect(usageText(usage({ calls: 40, estCostUsd: 123.456, capUsd: 250 }))).toBe(
      'This month: 40 builds, ~$123 of $250',
    )
  })
})

describe('usageWarning', () => {
  it('is empty without usage or without a cap', () => {
    expect(usageWarning(null)).toBe('')
    expect(usageWarning(undefined)).toBe('')
    expect(usageWarning(usage({ capUsd: 0, estCostUsd: 999 }))).toBe('')
  })

  it('stays silent below 80% of the cap', () => {
    expect(usageWarning(usage({ estCostUsd: 0 }))).toBe('')
    expect(usageWarning(usage({ estCostUsd: 7.99 }))).toBe('')
  })

  it('warns at exactly 80% and just below the cap', () => {
    expect(usageWarning(usage({ estCostUsd: 8 }))).toBe('You are close to the monthly AI budget.')
    expect(usageWarning(usage({ estCostUsd: 9.99 }))).toBe('You are close to the monthly AI budget.')
  })

  it('shows the stronger message at exactly the cap and over it', () => {
    const reached =
      'You have reached the monthly AI budget. Builds may be refused until it resets or the cap is raised.'
    expect(usageWarning(usage({ estCostUsd: 10 }))).toBe(reached)
    expect(usageWarning(usage({ estCostUsd: 25 }))).toBe(reached)
  })
})

describe('stageLabel and progressText', () => {
  it('always reports Planning for a plan call', () => {
    expect(stageLabel('plan', 0)).toBe('Planning')
    expect(stageLabel('plan', 500)).toBe('Planning')
  })

  it('reports Building until the checking threshold, then Checking', () => {
    expect(stageLabel('build', 0)).toBe('Building')
    expect(stageLabel('build', AI_CHECKING_AFTER_SECONDS - 1)).toBe('Building')
    expect(stageLabel('build', AI_CHECKING_AFTER_SECONDS)).toBe('Checking')
    expect(stageLabel('build', 300)).toBe('Checking')
  })

  it('formats the label with whole elapsed seconds', () => {
    expect(progressText('build', 5)).toBe('Building... 5s')
    expect(progressText('build', 5.9)).toBe('Building... 5s')
    expect(progressText('build', AI_CHECKING_AFTER_SECONDS)).toBe(`Checking... ${AI_CHECKING_AFTER_SECONDS}s`)
    expect(progressText('plan', 3)).toBe('Planning... 3s')
  })

  it('never shows negative seconds', () => {
    expect(progressText('build', -4)).toBe('Building... 0s')
  })
})

describe('sanitiseSavedPrompts', () => {
  it('returns an empty list for non-array input', () => {
    expect(sanitiseSavedPrompts(null)).toEqual([])
    expect(sanitiseSavedPrompts({ id: 'a' })).toEqual([])
    expect(sanitiseSavedPrompts('text')).toEqual([])
  })

  it('drops entries without an id, name or brief, and non-objects', () => {
    const out = sanitiseSavedPrompts([
      'x',
      null,
      { name: 'No id', brief: 'b' },
      { id: '', name: 'Empty id', brief: 'b' },
      { id: 'n', name: '   ', brief: 'b' },
      { id: 'b', name: 'No brief', brief: '  ' },
      { id: 'ok', name: ' Good ', brief: ' Keep me ' },
    ])
    expect(out).toEqual([{ id: 'ok', name: 'Good', brief: 'Keep me' }])
  })

  it('keeps the first of duplicate ids', () => {
    const out = sanitiseSavedPrompts([prompt('same', 'First'), prompt('same', 'Second')])
    expect(out.map((item) => item.name)).toEqual(['First'])
  })

  it('caps the name at 60 characters and the brief at the brief limit', () => {
    const out = sanitiseSavedPrompts([{ id: 'l', name: 'n'.repeat(80), brief: 'b'.repeat(AI_LIMITS.brief + 50) }])
    expect(out[0].name).toHaveLength(60)
    expect(out[0].brief).toHaveLength(AI_LIMITS.brief)
  })

  it('caps the list at SAVED_PROMPTS_MAX entries', () => {
    const raw = Array.from({ length: SAVED_PROMPTS_MAX + 5 }, (_v, i) => prompt(`id${i}`, `Name ${i}`))
    const out = sanitiseSavedPrompts(raw)
    expect(out).toHaveLength(SAVED_PROMPTS_MAX)
    expect(out[0].id).toBe('id0')
  })
})

describe('addSavedPrompt', () => {
  it('adds the new prompt at the front with trimmed name and brief', () => {
    const out = addSavedPrompt([prompt('old', 'Old')], '  Hero  ', '  Big headline  ', 'new')
    expect(out).toEqual([
      { id: 'new', name: 'Hero', brief: 'Big headline' },
      { id: 'old', name: 'Old', brief: 'brief for old' },
    ])
  })

  it('replaces a prompt with the same name (case-insensitive) and moves it to the front', () => {
    const list = [prompt('a', 'Alpha'), prompt('b', 'Beta'), prompt('c', 'Gamma')]
    const out = addSavedPrompt(list, 'beta', 'Updated brief', 'b2')
    expect(out.map((item) => item.id)).toEqual(['b2', 'a', 'c'])
    expect(out[0]).toEqual({ id: 'b2', name: 'beta', brief: 'Updated brief' })
  })

  it('returns an unchanged copy when the name or brief is blank', () => {
    const list = [prompt('a', 'Alpha')]
    const blankName = addSavedPrompt(list, '   ', 'brief', 'x')
    const blankBrief = addSavedPrompt(list, 'Name', '  ', 'x')
    expect(blankName).toEqual(list)
    expect(blankBrief).toEqual(list)
    expect(blankName).not.toBe(list)
    expect(blankBrief).not.toBe(list)
  })

  it('does not mutate the list it is given', () => {
    const list = [prompt('a', 'Alpha')]
    addSavedPrompt(list, 'Zed', 'brief', 'z')
    expect(list).toEqual([prompt('a', 'Alpha')])
  })

  it('truncates a long name to 60 characters and a long brief to the brief limit', () => {
    const out = addSavedPrompt([], 'N'.repeat(100), 'B'.repeat(AI_LIMITS.brief + 10), 'id')
    expect(out[0].name).toHaveLength(60)
    expect(out[0].brief).toHaveLength(AI_LIMITS.brief)
  })

  it('drops the oldest prompt once the list is at SAVED_PROMPTS_MAX', () => {
    const full = Array.from({ length: SAVED_PROMPTS_MAX }, (_v, i) => prompt(`id${i}`, `Name ${i}`))
    const out = addSavedPrompt(full, 'Fresh', 'brief', 'fresh')
    expect(out).toHaveLength(SAVED_PROMPTS_MAX)
    expect(out[0].id).toBe('fresh')
    expect(out.some((item) => item.id === `id${SAVED_PROMPTS_MAX - 1}`)).toBe(false)
    expect(out.some((item) => item.id === 'id0')).toBe(true)
  })
})

describe('deleteSavedPrompt', () => {
  it('removes the prompt with the matching id', () => {
    const list = [prompt('a', 'Alpha'), prompt('b', 'Beta')]
    expect(deleteSavedPrompt(list, 'a')).toEqual([prompt('b', 'Beta')])
  })

  it('returns an unchanged copy for an unknown id or an empty list', () => {
    const list = [prompt('a', 'Alpha')]
    expect(deleteSavedPrompt(list, 'missing')).toEqual(list)
    expect(deleteSavedPrompt([], 'a')).toEqual([])
  })
})

describe('loadSavedPrompts and storeSavedPrompts', () => {
  it('loads nothing and stores nothing when there is no storage', () => {
    expect(loadSavedPrompts(null)).toEqual([])
    expect(storeSavedPrompts([prompt('a', 'Alpha')], null)).toBe(false)
  })

  it('returns an empty list when nothing has been saved yet', () => {
    expect(loadSavedPrompts(memoryStorage())).toEqual([])
  })

  it('returns an empty list for corrupt JSON', () => {
    expect(loadSavedPrompts(memoryStorage({ [SAVED_PROMPTS_KEY]: '{not json' }))).toEqual([])
  })

  it('returns an empty list when the stored value is not a list', () => {
    expect(loadSavedPrompts(memoryStorage({ [SAVED_PROMPTS_KEY]: '{"a":1}' }))).toEqual([])
  })

  it('returns an empty list when reading storage throws', () => {
    expect(loadSavedPrompts(throwingStorage())).toEqual([])
  })

  it('returns false instead of throwing when writing storage fails', () => {
    expect(storeSavedPrompts([prompt('a', 'Alpha')], throwingStorage())).toBe(false)
  })

  it('writes under the shared key and reads the same list back', () => {
    const storage = memoryStorage()
    const list = [prompt('a', 'Alpha', 'first'), prompt('b', 'Beta', 'second')]
    expect(storeSavedPrompts(list, storage)).toBe(true)
    expect(JSON.parse(storage.data[SAVED_PROMPTS_KEY])).toEqual(list)
    expect(loadSavedPrompts(storage)).toEqual(list)
  })

  it('sanitises the stored list, so invalid rows never reach storage', () => {
    const storage = memoryStorage()
    expect(storeSavedPrompts([prompt('a', 'Alpha'), { id: '', name: 'bad', brief: 'x' } as unknown as SavedPrompt], storage)).toBe(true)
    expect(JSON.parse(storage.data[SAVED_PROMPTS_KEY])).toEqual([prompt('a', 'Alpha')])
  })

  it('caps what is stored at SAVED_PROMPTS_MAX', () => {
    const storage = memoryStorage()
    const many = Array.from({ length: SAVED_PROMPTS_MAX + 3 }, (_v, i) => prompt(`id${i}`, `Name ${i}`))
    storeSavedPrompts(many, storage)
    expect(loadSavedPrompts(storage)).toHaveLength(SAVED_PROMPTS_MAX)
  })

  it('uses window.localStorage by default', () => {
    expect(storeSavedPrompts([prompt('d', 'Default')])).toBe(true)
    expect(loadSavedPrompts()).toEqual([prompt('d', 'Default')])
  })

  it('falls back to empty when the default storage read throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadSavedPrompts()).toEqual([])
  })

  it('reports a refused write when the default storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(storeSavedPrompts([prompt('a', 'Alpha')])).toBe(false)
  })
})

describe('templateExampleText', () => {
  it('returns an empty string when there are no blocks', () => {
    expect(templateExampleText('Hero', [])).toBe('')
    expect(templateExampleText('Hero', null)).toBe('')
    expect(templateExampleText('Hero', { type: 'section' })).toBe('')
  })

  it('prefixes the trimmed, capped name and strips editor _id keys', () => {
    const out = templateExampleText('  Hero  ', [{ _id: 'x1', blockType: 'text', nested: { _id: 'x2', v: 1 } }])
    expect(out).toBe('Template "Hero": [{"blockType":"text","nested":{"v":1}}]')
    expect(out).not.toContain('_id')
  })

  it('caps the name at 60 characters', () => {
    const out = templateExampleText('N'.repeat(100), [{ blockType: 'text' }])
    expect(out.startsWith(`Template "${'N'.repeat(60)}": `)).toBe(true)
  })

  it('cuts the whole example to the example size limit', () => {
    const big = [{ blockType: 'text', body: 'z'.repeat(AI_LIMITS.example * 2) }]
    const out = templateExampleText('Big', big)
    expect(out).toHaveLength(AI_LIMITS.example)
  })
})

describe('normaliseTemplateExamples', () => {
  it('returns an empty list without a docs array', () => {
    expect(normaliseTemplateExamples(null)).toEqual([])
    expect(normaliseTemplateExamples({ docs: 'nope' })).toEqual([])
  })

  it('puts section templates first and drops templates with no blocks', () => {
    const out = normaliseTemplateExamples({
      docs: [
        { id: 'p1', name: 'Page one', kind: 'page', blocks: [{ blockType: 'text' }] },
        { id: 's1', name: 'Hero', kind: 'section', blocks: [{ blockType: 'hero' }] },
        { id: 'e1', name: 'Empty', kind: 'section', blocks: [] },
        'junk',
      ],
    })
    expect(out.map((item) => item.id)).toEqual(['s1', 'p1'])
    expect(out[0].text.startsWith('Template "Hero": ')).toBe(true)
  })

  it('names unnamed templates "Untitled" and falls back to the name for a missing id', () => {
    const out = normaliseTemplateExamples({
      docs: [
        { kind: 'section', blocks: [{ blockType: 'text' }] },
        { name: 'Solo', blocks: [{ blockType: 'text' }] },
      ],
    })
    expect(out.map((item) => [item.id, item.name])).toEqual([
      ['Untitled', 'Untitled'],
      ['Solo', 'Solo'],
    ])
  })
})

describe('fetchTemplateExamples', () => {
  it('requests the page templates list and returns the normalised examples', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({ docs: [{ id: 's1', name: 'Hero', kind: 'section', blocks: [{ blockType: 'hero' }] }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchTemplateExamples()
    expect(out.map((item) => item.id)).toEqual(['s1'])
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/page-templates')
  })

  it('returns an empty list for a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Nope' }, 500)))
    expect(await fetchTemplateExamples()).toEqual([])
  })

  it('returns an empty list when the request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down')
      }),
    )
    expect(await fetchTemplateExamples()).toEqual([])
  })

  it('returns an empty list when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    expect(await fetchTemplateExamples()).toEqual([])
  })
})

describe('normaliseMediaPlaceholders', () => {
  it('returns an empty list for a non-array', () => {
    expect(normaliseMediaPlaceholders(undefined)).toEqual([])
    expect(normaliseMediaPlaceholders({ alt: 'x' })).toEqual([])
  })

  it('uses the query as alt text when alt is missing, and skips entries with neither', () => {
    const out = normaliseMediaPlaceholders([
      { query: 'mountain lake' },
      { alt: 'Team photo' },
      { alt: '  ', query: '  ' },
      'junk',
      null,
    ])
    expect(out).toEqual([
      { alt: 'mountain lake', query: 'mountain lake' },
      { alt: 'Team photo', query: '' },
    ])
  })

  it('trims and caps alt and query at 200 characters', () => {
    const out = normaliseMediaPlaceholders([{ alt: ` ${'a'.repeat(250)} `, query: 'q'.repeat(250) }])
    expect(out[0].alt).toHaveLength(200)
    expect(out[0].query).toHaveLength(200)
  })

  it('keeps at most 20 placeholders', () => {
    const raw = Array.from({ length: 25 }, (_v, i) => ({ alt: `img ${i}`, query: `q${i}` }))
    const out = normaliseMediaPlaceholders(raw)
    expect(out).toHaveLength(20)
    expect(out[19].alt).toBe('img 19')
  })
})

describe('fetchAiStatus', () => {
  it('returns providers and the usage block together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          providers: { claude: true, openai: false },
          usage: { calls: 2, inputTokens: 10, outputTokens: 20, estCostUsd: 0.4, capUsd: 5 },
        }),
      ),
    )
    expect(await fetchAiStatus()).toEqual({
      providers: { claude: true, openai: false },
      usage: { calls: 2, inputTokens: 10, outputTokens: 20, estCostUsd: 0.4, capUsd: 5 },
    })
  })

  it('returns a null usage when the server does not send one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ providers: { claude: true } })))
    expect(await fetchAiStatus()).toEqual({ providers: { claude: true, openai: false }, usage: null })
  })

  it('throws the server error message for a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Service down' }, 503)))
    await expect(fetchAiStatus()).rejects.toThrow(AiBuilderError)
    await expect(fetchAiStatus()).rejects.toThrow('Service down')
  })

  it('falls back to a status message when the failed body has no error text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    await expect(fetchAiStatus()).rejects.toThrow('The AI request failed (HTTP 500).')
  })

  it('throws when the providers block is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ usage: { calls: 1 } })))
    await expect(fetchAiStatus()).rejects.toThrow('Unexpected response from the AI builder.')
  })
})
