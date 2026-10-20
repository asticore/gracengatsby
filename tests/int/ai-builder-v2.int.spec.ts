// @vitest-environment node
// Build with AI v2, server side: theme context in the guide, media placeholders, model allowlist,
// usage and spend cap, and refinement inputs. All pure or run against a fake D1; nothing is fetched.
import { describe, expect, it } from 'vitest'

import { buildGuide, GUIDE_MAX_CHARS } from '@/features/ai/builderGuide'
import { resolveMediaPlaceholders, queryTokens, bestMediaMatch, type MediaCandidate } from '@/features/ai/builderMedia'
import { buildSystemPrompt, parseBuilderRequest, requestText } from '@/features/ai/builderRequest'
import { validateBuilderOutput } from '@/features/ai/builderValidate'
import { extractUsage } from '@/features/ai/client'
import { AI_BUILDER_MODEL_OPTIONS, AI_BUILDER_MODELS, estimateCostMicro, resolveBuilderModel } from '@/features/ai/models'
import { monthStart, readUsageSummary, recordUsage, type UsageD1 } from '@/features/ai/builderUsage'
import { Integrations } from '@/globals/Integrations'

const BASE = { action: 'build', provider: 'claude', mode: 'section', brief: 'A hero' }

describe('guide theme context', () => {
  const guide = buildGuide({
    mode: 'page',
    siteName: 'Candle Co',
    tagline: 'Slow evenings',
    colours: [
      { id: 'primary', value: '#1f2230' },
      { id: 'bad id', value: '#fff' },
      { id: 'accent', value: 'url(javascript:x)' },
    ],
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
  })
  it('lists safe theme colours as tokens and prefers them', () => {
    expect(guide).toContain('primary=#1f2230')
    expect(guide).toContain('var(--eg-c-primary)')
    expect(guide).not.toContain('bad id')
    expect(guide).not.toContain('url(')
  })
  it('names tagline and fonts, stays ASCII and under the cap', () => {
    expect(guide).toContain('Tagline: Slow evenings')
    expect(guide).toContain('headings Playfair Display, body Inter')
    expect(/^[\x00-\x7f]*$/.test(guide)).toBe(true)
    expect(guide.indexOf(String.fromCharCode(92))).toBe(-1)
    expect(guide.length).toBeLessThan(GUIDE_MAX_CHARS)
  })
  it('explains the media placeholder', () => {
    expect(guide).toContain('mediaQuery')
  })
})

describe('media placeholders', () => {
  const reply = JSON.stringify({
    format: 'engage-template',
    schemaVersion: 1,
    kind: 'section',
    tree: [
      {
        blockType: 'section',
        columns: [
          {
            width: 12,
            blocks: [
              { blockType: 'element', elementType: 'image', props: { title: 'Hi', image: { mediaQuery: 'candle on a table', alt: 'A candle' } } },
              { blockType: 'element', elementType: 'image', props: { title: 'Two', image: 12345 } },
            ],
          },
        ],
      },
    ],
  })

  it('the validator keeps a placeholder, fills alt, and drops raw ids', () => {
    const result = validateBuilderOutput(reply, { mode: 'section' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const blocks = result.sections[0].columns![0].blocks!
    expect(blocks[0].props).toMatchObject({ image: { mediaQuery: 'candle on a table', alt: 'A candle' }, alt: 'A candle' })
    expect(blocks[1].props).not.toHaveProperty('image')
  })

  it('tokenises and scores candidates by file name and alt', () => {
    expect(queryTokens('Photo of a candle on the table.jpg')).toEqual(['candle', 'table'])
    const pool: MediaCandidate[] = [
      { id: 1, filename: 'sunset.jpg', alt: 'sunset' },
      { id: 2, filename: 'candle-table.jpg', alt: '' },
      { id: 3, filename: 'candle.pdf', alt: 'candle table', mimeType: 'application/pdf' },
    ]
    expect(bestMediaMatch(['candle', 'table'], pool)?.id).toBe(2)
    expect(bestMediaMatch(['moon'], pool)).toBeNull()
  })

  it('resolves to an id when matched and removes + reports when not', async () => {
    const result = validateBuilderOutput(reply, { mode: 'section' })
    if (!result.ok) throw new Error('invalid')
    const hit = await resolveMediaPlaceholders(structuredClone(result.sections), async () => [{ id: 7, filename: 'candle-table.jpg' }])
    expect(hit.resolved).toBe(1)
    expect(hit.unresolved).toEqual([])
    const sections = structuredClone(result.sections)
    const miss = await resolveMediaPlaceholders(sections, async () => {
      throw new Error('db down')
    })
    expect(miss.resolved).toBe(0)
    expect(miss.unresolved).toEqual([{ elementType: 'image', field: 'image', query: 'candle on a table', alt: 'A candle' }])
    expect(JSON.stringify(sections)).not.toContain('mediaQuery')
  })
})

describe('model allowlist', () => {
  it('only resolves allowed models and falls back to the default', () => {
    expect(resolveBuilderModel('claude', 'claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(resolveBuilderModel('claude', 'gpt-4o', 'nope')).toBe(AI_BUILDER_MODELS.claude)
    expect(resolveBuilderModel('openai', undefined, 'gpt-4o-mini')).toBe('gpt-4o-mini')
  })
  it('the Integrations selects match the allowlist', () => {
    const field = (name: string) => (Integrations.fields as unknown as { name?: string; options?: { value: string }[] }[]).find((f) => f.name === name)
    expect(field('aiClaudeModel')?.options?.map((o) => o.value)).toEqual(AI_BUILDER_MODEL_OPTIONS.claude.map((o) => o.value))
    expect(field('aiOpenaiModel')?.options?.map((o) => o.value)).toEqual(AI_BUILDER_MODEL_OPTIONS.openai.map((o) => o.value))
    expect(field('aiMonthlyCapUsd')).toBeTruthy()
  })
  it('the request accepts an allowed model and rejects others', () => {
    expect(parseBuilderRequest({ ...BASE, model: 'claude-haiku-4-5' })).toMatchObject({ ok: true, value: { model: 'claude-haiku-4-5' } })
    expect(parseBuilderRequest({ ...BASE, model: 'gpt-4o' }).ok).toBe(false)
  })
})

describe('usage and cap', () => {
  const makeD1 = () => {
    const rows: { created_at: string; input_tokens: number; output_tokens: number; est_cost_micro: number }[] = []
    const d1: UsageD1 = {
      prepare: (sqlText: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            if (sqlText.startsWith('INSERT')) rows.push({ created_at: String(args[0]), input_tokens: Number(args[5]), output_tokens: Number(args[6]), est_cost_micro: Number(args[7]) })
          },
          all: async <T,>() => {
            const mine = rows.filter((r) => r.created_at >= String(args[0]))
            const sum = (k: 'input_tokens' | 'output_tokens' | 'est_cost_micro') => mine.reduce((a, r) => a + r[k], 0)
            return { results: [{ calls: mine.length, input_tokens: sum('input_tokens'), output_tokens: sum('output_tokens'), micro: sum('est_cost_micro') }] as T[] }
          },
        }),
      }),
    }
    return d1
  }

  it('estimates cost from list prices', () => {
    expect(estimateCostMicro('claude', 'claude-sonnet-4-5', 1_000_000, 0)).toBe(3_000_000)
    expect(estimateCostMicro('claude', 'unknown', 1000, 0)).toBe(15_000)
  })

  it('sums month-to-date and flags the cap', async () => {
    const d1 = makeD1()
    const now = new Date('2026-10-20T10:00:00Z')
    await recordUsage({ userId: '1', provider: 'claude', model: 'claude-sonnet-4-5', mode: 'page', inputTokens: 100_000, outputTokens: 10_000, ok: true }, { d1, now })
    await recordUsage({ userId: '1', provider: 'claude', model: 'claude-sonnet-4-5', mode: 'page', inputTokens: 1000, outputTokens: 1000, ok: true }, { d1, now: new Date('2026-09-30T10:00:00Z') })
    const open = await readUsageSummary(0, { d1, now })
    expect(open).toMatchObject({ month: '2026-10', calls: 1, inputTokens: 100_000, outputTokens: 10_000, capUsd: 0, capReached: false })
    expect(open.estCostUsd).toBeCloseTo(0.45, 5)
    expect((await readUsageSummary(0.45, { d1, now })).capReached).toBe(true)
    expect((await readUsageSummary(1, { d1, now })).capReached).toBe(false)
    expect(monthStart(now).iso).toBe('2026-10-01T00:00:00.000Z')
  })

  it('reads provider token counts from both response shapes', () => {
    expect(extractUsage('claude', { usage: { input_tokens: 5, output_tokens: 7 } })).toEqual({ inputTokens: 5, outputTokens: 7 })
    expect(extractUsage('openai', { usage: { prompt_tokens: 3, completion_tokens: 4 } })).toEqual({ inputTokens: 3, outputTokens: 4 })
    expect(extractUsage('openai', {})).toBeNull()
  })
})

describe('refinement inputs', () => {
  it('keeps the last 6 history turns, trimmed and capped', () => {
    const history = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `  turn ${i}  ` }))
    const parsed = parseBuilderRequest({ ...BASE, history })
    if (parsed.ok === false) throw new Error(parsed.error)
    expect(parsed.value.history).toHaveLength(6)
    expect(parsed.value.history[0].text).toBe('turn 3')
    expect(parseBuilderRequest({ ...BASE, history: [{ role: 'system', text: 'x' }] }).ok).toBe(false)
  })

  it('rejects an oversized previous result and puts a small one in the prompt', () => {
    expect(parseBuilderRequest({ ...BASE, current: [{ x: 'a'.repeat(61_000) }] }).ok).toBe(false)
    const parsed = parseBuilderRequest({ ...BASE, brief: 'make it darker', current: [{ blockType: 'section' }], history: [{ role: 'user', text: 'a hero' }] })
    if (parsed.ok === false) throw new Error(parsed.error)
    const text = requestText(parsed.value, 'build')
    expect(text).toContain('<current>')
    expect(text).toContain('<history>')
    expect(buildSystemPrompt({ mode: 'section' })).toContain('<current>')
  })
})
