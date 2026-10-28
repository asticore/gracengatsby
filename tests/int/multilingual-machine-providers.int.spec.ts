// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  AI_BATCH,
  DEEPL_FREE_URL,
  DEEPL_PRO_URL,
  GOOGLE_BATCH,
  GOOGLE_URL,
  buildDeeplBody,
  buildGoogleBody,
  deeplTarget,
  deeplUrl,
  errorForStatus,
  parseAiArray,
  parseDeeplResponse,
  parseGoogleResponse,
  translateWithProvider,
  MachineError,
  type MachineProviderId,
} from '@/features/multilingual/machine/providers'
import {
  checkCharBudget,
  keysFromIntegrations,
  parseMachineCharLimit,
  parseMachineOverrides,
  providerFor,
  monthStartIso,
  type MachineSettings,
} from '@/features/multilingual/machine/config'
import { charsUsedThisMonth, recordCharUsage, type UsageD1 } from '@/features/multilingual/machine/usage'
import { testMachineProvider, translateTexts } from '@/features/multilingual/machine/service'

const KEY = 'sekret-key-123'

/** A fetch that records each call and answers with the given response builder. */
function mockFetch(respond: (url: string, init: RequestInit) => { status?: number; body?: unknown; text?: string }) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const r = respond(url, init)
    const status = r.status ?? 200
    return new Response(r.text ?? JSON.stringify(r.body ?? {}), { status, headers: { 'content-type': 'application/json' } })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const googleOk = (texts: string[]) => ({ data: { translations: texts.map((t) => ({ translatedText: `FR:${t}` })) } })
const deeplOk = (texts: string[]) => ({ translations: texts.map((t) => ({ text: `FR:${t}` })) })
const claudeOk = (text: string) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } })
const openaiOk = (text: string) => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })

describe('Google Cloud Translation', () => {
  it('builds a v2 body with primary language codes and plain text format', () => {
    expect(buildGoogleBody(['Hi'], 'en-AU', 'pt-BR')).toEqual({ q: ['Hi'], source: 'en', target: 'pt', format: 'text' })
  })

  it('sends the key in a header, never in the URL, and returns translations in order', async () => {
    const f = mockFetch((_url, init) => ({ body: googleOk(['Hello', 'Bye']) }))
    const out = await translateWithProvider('google', { texts: ['Hello', 'Bye'], source: 'en', target: 'fr' }, { apiKey: KEY }, { fetch: f.fetch })
    expect(out).toEqual(['FR:Hello', 'FR:Bye'])
    expect(f.calls[0].url).toBe(GOOGLE_URL)
    expect(f.calls[0].url).not.toContain(KEY)
    expect((f.calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY)
  })

  it('splits long lists into batches', async () => {
    const texts = Array.from({ length: GOOGLE_BATCH * 2 + 3 }, (_, i) => `t${i}`)
    const f = mockFetch((_u, init) => ({ body: googleOk(JSON.parse(String(init.body)).q) }))
    const out = await translateWithProvider('google', { texts, source: 'en', target: 'fr' }, { apiKey: KEY }, { fetch: f.fetch })
    expect(out).toHaveLength(texts.length)
    expect(f.calls).toHaveLength(3)
  })

  it('rejects a reply with the wrong number of translations', () => {
    expect(() => parseGoogleResponse(googleOk(['a']), 2)).toThrow(MachineError)
    expect(() => parseGoogleResponse({}, 1)).toThrow(/unexpected reply/)
  })

  it('maps HTTP failures to codes without echoing the key', async () => {
    for (const [status, code] of [
      [403, 'auth'],
      [429, 'rate'],
      [400, 'bad_request'],
      [503, 'unavailable'],
    ] as const) {
      const f = mockFetch(() => ({ status, body: { error: { message: `bad key ${KEY}` } } }))
      const err = await translateWithProvider('google', { texts: ['x'], source: 'en', target: 'fr' }, { apiKey: KEY }, { fetch: f.fetch }).catch((e) => e)
      expect(err).toBeInstanceOf(MachineError)
      expect(err.code).toBe(code)
      expect(err.message).not.toContain(KEY)
    }
  })

  it('reports a missing key without calling the network', async () => {
    const f = mockFetch(() => ({ body: {} }))
    const err = await translateWithProvider('google', { texts: ['x'], source: 'en', target: 'fr' }, { apiKey: '  ' }, { fetch: f.fetch }).catch((e) => e)
    expect(err.code).toBe('no_key')
    expect(f.fetch).not.toHaveBeenCalled()
  })
})

describe('DeepL', () => {
  it('uses the free host for ":fx" keys and the pro host otherwise, honouring an explicit plan', () => {
    expect(deeplUrl({ apiKey: 'abc:fx' })).toBe(DEEPL_FREE_URL)
    expect(deeplUrl({ apiKey: 'abc' })).toBe(DEEPL_PRO_URL)
    expect(deeplUrl({ apiKey: 'abc:fx', deeplPlan: 'pro' })).toBe(DEEPL_PRO_URL)
    expect(deeplUrl({ apiKey: 'abc', deeplPlan: 'free' })).toBe(DEEPL_FREE_URL)
  })

  it('maps language tags to DeepL codes, with regional variants where DeepL requires them', () => {
    expect(deeplTarget('en')).toBe('EN-US')
    expect(deeplTarget('en-gb')).toBe('EN-GB')
    expect(deeplTarget('pt')).toBe('PT-BR')
    expect(deeplTarget('pt-PT')).toBe('PT-PT')
    expect(deeplTarget('de-CH')).toBe('DE')
    expect(buildDeeplBody(['x'], 'en-AU', 'fr')).toEqual({ text: ['x'], source_lang: 'EN', target_lang: 'FR' })
  })

  it('posts to the free endpoint with the auth header and returns translations', async () => {
    const f = mockFetch(() => ({ body: deeplOk(['Hello']) }))
    const out = await translateWithProvider('deepl', { texts: ['Hello'], source: 'en', target: 'fr' }, { apiKey: `${KEY}:fx` }, { fetch: f.fetch })
    expect(out).toEqual(['FR:Hello'])
    expect(f.calls[0].url).toBe(DEEPL_FREE_URL)
    expect((f.calls[0].init.headers as Record<string, string>).authorization).toBe(`DeepL-Auth-Key ${KEY}:fx`)
    expect(f.calls[0].url).not.toContain(KEY)
  })

  it('maps quota exhaustion (456) and auth failures', () => {
    expect(errorForStatus('deepl', 456).code).toBe('quota')
    expect(errorForStatus('deepl', 403).code).toBe('auth')
    expect(parseDeeplResponse(deeplOk(['a', 'b']), 2)).toEqual(['FR:a', 'FR:b'])
    expect(() => parseDeeplResponse({ translations: [] }, 1)).toThrow(MachineError)
  })
})

describe('AI providers (Claude, OpenAI)', () => {
  it('calls Anthropic with the Claude key and parses a JSON array reply', async () => {
    const f = mockFetch(() => ({ body: claudeOk('["Bonjour","Au revoir"]') }))
    const out = await translateWithProvider('claude', { texts: ['Hello', 'Bye'], source: 'en', target: 'fr' }, { apiKey: KEY }, { fetch: f.fetch })
    expect(out).toEqual(['Bonjour', 'Au revoir'])
    expect(f.calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect((f.calls[0].init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
    const body = JSON.parse(String(f.calls[0].init.body))
    expect(body.system).toContain('from en to fr')
    expect(JSON.parse(body.messages[0].content[0].text)).toEqual(['Hello', 'Bye'])
  })

  it('calls OpenAI with a bearer key and accepts a fenced reply', async () => {
    const f = mockFetch(() => ({ body: openaiOk('```json\n["Hallo"]\n```') }))
    const out = await translateWithProvider('openai', { texts: ['Hi'], source: 'en', target: 'de' }, { apiKey: KEY }, { fetch: f.fetch })
    expect(out).toEqual(['Hallo'])
    expect(f.calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect((f.calls[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
  })

  it('rejects a reply that is not an array of the right length', () => {
    expect(() => parseAiArray('Bonjour', 1)).toThrow(/unexpected reply/)
    expect(() => parseAiArray('["a"]', 2)).toThrow(MachineError)
    expect(() => parseAiArray('[1]', 1)).toThrow(MachineError)
  })

  it('maps an AI provider rejection to an auth code without the key', async () => {
    const f = mockFetch(() => ({ status: 401, body: { error: 'invalid x-api-key' } }))
    const err = await translateWithProvider('claude', { texts: ['x'], source: 'en', target: 'fr' }, { apiKey: KEY }, { fetch: f.fetch }).catch((e) => e)
    expect(err.code).toBe('auth')
    expect(err.message).not.toContain(KEY)
  })

  it('batches AI calls', async () => {
    const texts = Array.from({ length: AI_BATCH + 1 }, (_, i) => `s${i}`)
    const f = mockFetch((_u, init) => ({ body: claudeOk(JSON.stringify(JSON.parse(JSON.parse(String(init.body)).messages[0].content[0].text).map((s: string) => s.toUpperCase()))) }))
    const out = await translateWithProvider('claude', { texts, source: 'en', target: 'fr' }, { apiKey: KEY }, { fetch: f.fetch })
    expect(out[0]).toBe('S0')
    expect(f.calls).toHaveLength(2)
  })
})

describe('provider selection, settings and budget', () => {
  it('uses the per-language override, else the default, else nothing', () => {
    const s: MachineSettings = { enabled: true, defaultProvider: 'google', overrides: { de: 'deepl' }, monthlyCharLimit: 0, autoDraft: false }
    expect(providerFor(s, 'de')).toBe('deepl')
    expect(providerFor(s, 'fr')).toBe('google')
    expect(providerFor({ ...s, defaultProvider: null }, 'fr')).toBeNull()
  })

  it('reads overrides tolerantly: bad JSON and unknown providers are dropped', () => {
    expect(parseMachineOverrides('{"de":"deepl","ja":"nope","bad code!":"google"}')).toEqual({ de: 'deepl' })
    expect(parseMachineOverrides('not json')).toEqual({})
    expect(parseMachineOverrides(['x'])).toEqual({})
    expect(parseMachineCharLimit('5000')).toBe(5000)
    expect(parseMachineCharLimit(-3)).toBe(0)
  })

  it('takes keys from Integrations and defaults the DeepL plan to auto', () => {
    const keys = keysFromIntegrations({ translation: { googleApiKey: ' g ', deeplApiKey: '' }, claudeApiKey: 'c' })
    expect(keys).toEqual({ google: 'g', deepl: undefined, claude: 'c', openai: undefined, deeplPlan: 'auto' })
  })

  it('allows requests under the limit and refuses ones over it; a zero limit never refuses', () => {
    expect(checkCharBudget({ used: 900, requested: 100, limit: 1000 })).toEqual({ ok: true, remaining: 100 })
    expect(checkCharBudget({ used: 900, requested: 101, limit: 1000 }).ok).toBe(false)
    expect(checkCharBudget({ used: 5000, requested: 5000, limit: 0 }).ok).toBe(true)
  })

  it('starts the monthly window at the first of the month in UTC', () => {
    expect(monthStartIso(new Date('2026-10-28T15:00:00Z'))).toBe('2026-10-01T00:00:00.000Z')
  })
})

/** A fake D1 that answers the three statements the machine layer makes. */
function fakeD1(state: { chars?: number; writes: unknown[][]; sums?: boolean }) {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async <T,>() => {
          if (/SUM\(chars\)/.test(sql)) return { results: [{ chars: state.chars ?? 0 }] as T[] }
          if (/est_cost_micro/.test(sql)) return { results: [{ calls: 0, input_tokens: 0, output_tokens: 0, micro: 0 }] as T[] }
          return { results: [] as T[] }
        },
        run: async () => {
          if (/INSERT INTO eg_machine_translation_usage/.test(sql)) state.writes.push(args)
          return {}
        },
      }),
    }),
  } as unknown as UsageD1
}

/** A fake engine: the Languages and Integrations globals, as findGlobal returns them. */
function fakeEngine(opts: { enabled?: boolean; machine?: Record<string, unknown>; keys?: Record<string, unknown> }) {
  const languageSettings = {
    multilingual: {
      enabled: true,
      defaultLocale: 'en',
      activeLocales: ['en', 'fr', 'de'],
      machineEnabled: opts.enabled ?? true,
      machineDefaultProvider: 'google',
      machineOverrides: '{}',
      machineMonthlyCharLimit: 0,
      ...(opts.machine ?? {}),
    },
  }
  const integrations: Record<string, unknown> = {
    claudeApiKey: null,
    openaiApiKey: null,
    aiMonthlyCapUsd: 0,
    translation: { googleApiKey: KEY, deeplApiKey: null, deeplPlan: 'auto' },
    ...(opts.keys ?? {}),
  }
  return {
    findGlobal: vi.fn(async ({ slug }: { slug: string }) => {
      if (slug === 'language-settings') return languageSettings
      if (slug === 'site-settings') return { features: { multilingual: true } }
      if (slug === 'integrations') return integrations
      return {}
    }),
  }
}

describe('translateTexts (limit handling and status outcomes)', () => {
  it('translates, records the characters sent, and returns the translations', async () => {
    const state = { writes: [] as unknown[][] }
    const f = mockFetch((_u, init) => ({ body: googleOk(JSON.parse(String(init.body)).q) }))
    const out = await translateTexts({
      engine: fakeEngine({}),
      locale: 'fr',
      source: 'en',
      texts: ['Hello', 'World'],
      d1: fakeD1(state),
      deps: { fetch: f.fetch },
    })
    expect(out).toEqual({ ok: true, provider: 'google', translations: ['FR:Hello', 'FR:World'], chars: 10 })
    expect(state.writes[0]).toEqual([expect.any(String), 'google', 'fr', 10, 1])
  })

  it('refuses when the call would go over the monthly limit, and makes no request', async () => {
    const f = mockFetch(() => ({ body: {} }))
    const out = await translateTexts({
      engine: fakeEngine({ machine: { machineMonthlyCharLimit: 100 } }),
      locale: 'fr',
      source: 'en',
      texts: ['x'.repeat(40)],
      d1: fakeD1({ chars: 80, writes: [] }),
      deps: { fetch: f.fetch },
    })
    expect(out).toMatchObject({ ok: false, code: 'limit', provider: 'google' })
    expect(f.fetch).not.toHaveBeenCalled()
  })

  it('reports a provider failure with its code and records a failed call with zero characters', async () => {
    const state = { writes: [] as unknown[][] }
    const f = mockFetch(() => ({ status: 403, body: {} }))
    const out = await translateTexts({ engine: fakeEngine({}), locale: 'fr', source: 'en', texts: ['Hi'], d1: fakeD1(state), deps: { fetch: f.fetch } })
    expect(out).toMatchObject({ ok: false, code: 'auth', provider: 'google' })
    expect(state.writes[0]).toEqual([expect.any(String), 'google', 'fr', 0, 0])
  })

  it('reports disabled, no provider and no key before touching the network', async () => {
    const f = mockFetch(() => ({ body: {} }))
    const deps = { fetch: f.fetch }
    expect(await translateTexts({ engine: fakeEngine({ enabled: false }), locale: 'fr', source: 'en', texts: ['x'], d1: fakeD1({ writes: [] }), deps })).toMatchObject({ code: 'disabled' })
    expect(await translateTexts({ engine: fakeEngine({ machine: { machineDefaultProvider: null } }), locale: 'fr', source: 'en', texts: ['x'], d1: fakeD1({ writes: [] }), deps })).toMatchObject({ code: 'no_provider' })
    expect(await translateTexts({ engine: fakeEngine({ keys: { translation: { googleApiKey: null } } }), locale: 'fr', source: 'en', texts: ['x'], d1: fakeD1({ writes: [] }), deps })).toMatchObject({ code: 'no_key' })
    expect(f.fetch).not.toHaveBeenCalled()
  })

  it('stops AI translation once the shared monthly AI spend cap is reached', async () => {
    const f = mockFetch(() => ({ body: claudeOk('["x"]') }))
    const engine = fakeEngine({ machine: { machineDefaultProvider: 'claude' }, keys: { claudeApiKey: KEY, aiMonthlyCapUsd: 0 } })
    engine.findGlobal = vi.fn(async ({ slug }: { slug: string }) => {
      if (slug === 'integrations') return { claudeApiKey: KEY, aiMonthlyCapUsd: 0.000001 }
      if (slug === 'language-settings') return { multilingual: { enabled: true, defaultLocale: 'en', activeLocales: ['en', 'fr'], machineEnabled: true, machineDefaultProvider: 'claude' } }
      return { features: { multilingual: true } }
    }) as never
    // A cap of one millionth of a dollar is exceeded by any recorded spend.
    const d1 = {
      prepare: (sql: string) => ({
        bind: () => ({
          all: async <T,>() => (/est_cost_micro/.test(sql) ? { results: [{ calls: 1, input_tokens: 1, output_tokens: 1, micro: 100 }] as T[] } : { results: [{ chars: 0 }] as T[] }),
          run: async () => ({}),
        }),
      }),
    } as unknown as UsageD1
    const out = await translateTexts({ engine: engine as never, locale: 'fr', source: 'en', texts: ['Hi'], d1, deps: { fetch: f.fetch } })
    expect(out).toMatchObject({ ok: false, code: 'ai_cap' })
    expect(f.fetch).not.toHaveBeenCalled()
  })
})

describe('testMachineProvider (Test connection)', () => {
  it('reports success when the provider answers, without counting characters', async () => {
    const state = { writes: [] as unknown[][] }
    const f = mockFetch(() => ({ body: googleOk(['Hello']) }))
    const out = await testMachineProvider({ engine: fakeEngine({}), provider: 'google', d1: fakeD1(state), deps: { fetch: f.fetch } })
    expect(out).toMatchObject({ ok: true, provider: 'google' })
    expect(state.writes).toHaveLength(0)
  })

  it('reports a rejected key with a message that does not contain it', async () => {
    const f = mockFetch(() => ({ status: 401, body: {} }))
    const out = await testMachineProvider({ engine: fakeEngine({}), provider: 'google', d1: fakeD1({ writes: [] }), deps: { fetch: f.fetch } })
    expect(out).toMatchObject({ ok: false, code: 'auth' })
    expect(JSON.stringify(out)).not.toContain(KEY)
  })
})

describe('usage counter', () => {
  it('sums this month and writes one row per call', async () => {
    const state = { chars: 1234, writes: [] as unknown[][] }
    expect(await charsUsedThisMonth({ d1: fakeD1(state), now: new Date('2026-10-28T00:00:00Z') })).toBe(1234)
    await recordCharUsage({ provider: 'deepl', locale: 'de', chars: 50, ok: true }, { d1: fakeD1(state) })
    expect(state.writes).toHaveLength(1)
  })

  it('reads zero rather than failing when the table cannot be read', async () => {
    const broken = { prepare: () => { throw new Error('no such table') } } as unknown as UsageD1
    expect(await charsUsedThisMonth({ d1: broken })).toBe(0)
  })
})

describe('module edges', () => {
  it('a missing provider id in translateWithProvider is a no-op for empty input', async () => {
    expect(await translateWithProvider('deepl' as MachineProviderId, { texts: [], source: 'en', target: 'fr' }, { apiKey: '' })).toEqual([])
  })
})
