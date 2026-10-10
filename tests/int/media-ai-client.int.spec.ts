// @vitest-environment node
// The vision-model client: request shapes, response parsing, error mapping and
// alt text cleaning. fetch is mocked; no provider is contacted.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/engine', () => ({ getEngine: vi.fn() }))

import { AiError, buildAnthropicRequest, buildOpenAiRequest, callAi, extractText, messageForStatus } from '@/features/ai/client'
import { AI_MODELS } from '@/features/ai/models'
import { ALT_TEXT_MAX_LENGTH, cleanAltText, generateAltText } from '@/features/ai/altText'

const image = { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' }
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('request shapes', () => {
  it('builds an Anthropic Messages request with the picture as base64', () => {
    const body = buildAnthropicRequest({ provider: 'claude', prompt: 'Describe', image, maxTokens: 120 })
    expect(body.model).toBe(AI_MODELS.claude)
    expect(body.max_tokens).toBe(120)
    const content = (body.messages[0] as { content: Array<Record<string, unknown>> }).content
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw==' } })
    expect(content[1]).toEqual({ type: 'text', text: 'Describe' })
  })

  it('builds an OpenAI Chat Completions request with a data URL', () => {
    const body = buildOpenAiRequest({ provider: 'openai', prompt: 'Describe', image })
    expect(body.model).toBe(AI_MODELS.openai)
    const content = (body.messages[0] as { content: Array<Record<string, unknown>> }).content
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw==' } })
  })

  it('omits the image part when none is given', () => {
    const body = buildOpenAiRequest({ provider: 'openai', prompt: 'Hi' })
    expect((body.messages[0] as { content: unknown[] }).content).toHaveLength(1)
  })
})

describe('callAi', () => {
  it('posts to Anthropic with the key and version headers and returns the text', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: 'A harbour at dusk' }] }))
    const text = await callAi({ provider: 'claude', prompt: 'Describe', image }, { apiKey: 'sk-ant-TEST', fetch: fetchImpl as unknown as typeof fetch })
    expect(text).toBe('A harbour at dusk')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-TEST')
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })

  it('posts to OpenAI with a bearer token and reads the first choice', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'A dog on a beach' } }] }))
    const text = await callAi({ provider: 'openai', prompt: 'Describe', image }, { apiKey: 'sk-TEST', fetch: fetchImpl as unknown as typeof fetch })
    expect(text).toBe('A dog on a beach')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-TEST')
  })

  it('refuses to call without a key, with a message that names where to set it', async () => {
    await expect(callAi({ provider: 'claude', prompt: 'x' }, { apiKey: '' })).rejects.toThrow(/Integrations/)
  })

  it('maps HTTP failures to readable messages and never includes the key', async () => {
    const secret = 'sk-SECRET-VALUE'
    const denied = vi.fn(async () => new Response('{"error":"bad key sk-SECRET-VALUE"}', { status: 401 }))
    const error = await callAi({ provider: 'openai', prompt: 'x' }, { apiKey: secret, fetch: denied as unknown as typeof fetch }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).message).toMatch(/rejected the API key/)
    expect((error as AiError).message).not.toContain(secret)
    expect((error as AiError).status).toBe(401)

    expect(messageForStatus('claude', 429)).toMatch(/rate limit/)
    expect(messageForStatus('openai', 503)).toMatch(/unavailable/)
  })

  it('times out with its own message', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
    )
    const error = await callAi({ provider: 'claude', prompt: 'x' }, { apiKey: 'k', fetch: fetchImpl as unknown as typeof fetch, timeoutMs: 5 }).catch((e: unknown) => e)
    expect((error as AiError).message).toMatch(/took too long/)
  })

  it('reports an empty reply as an error rather than saving nothing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '   ' } }] }))
    await expect(callAi({ provider: 'openai', prompt: 'x' }, { apiKey: 'k', fetch: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/no text/)
  })

  it('extracts text from either response shape', () => {
    expect(extractText('claude', { content: [{ type: 'tool_use' }, { type: 'text', text: 'ok' }] })).toBe('ok')
    expect(extractText('openai', { choices: [] })).toBe('')
    expect(extractText('claude', null)).toBe('')
  })
})

describe('alt text', () => {
  it('strips preambles, quotes and extra whitespace', () => {
    expect(cleanAltText('  "Image of a red boat on the water."  ')).toBe('A red boat on the water.')
    expect(cleanAltText('Alt text: Two cyclists on a bridge')).toBe('Two cyclists on a bridge')
  })

  it('caps the length at a word boundary', () => {
    const long = 'word '.repeat(60)
    const cleaned = cleanAltText(long)
    expect(cleaned.length).toBeLessThanOrEqual(ALT_TEXT_MAX_LENGTH)
    expect(cleaned.endsWith(' ')).toBe(false)
  })

  it('writes alt text through the chosen provider', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: 'Sailboats in a marina' }] }))
    const text = await generateAltText('claude', image, 'k', fetchImpl as unknown as typeof fetch)
    expect(text).toBe('Sailboats in a marina')
  })
})
