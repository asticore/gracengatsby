/**
 * One call to a vision model, for either provider.
 *
 * Requests are made from the server only. The picture is sent as base64 bytes
 * read from R2 rather than as a URL, because the providers cannot reach this
 * app's own file route. Keys are read by the caller and never logged; error
 * messages carry the HTTP status, never a key or a response body.
 */

import { createSseParser, createStreamAccumulator, parseProviderEvent } from './streamParse'
import { AI_MODELS, AI_TIMEOUT_MS, ANTHROPIC_URL, ANTHROPIC_VERSION, OPENAI_URL, type AiProvider } from './models'

export type AiImage = { data: Uint8Array; mimeType: string }

export type AiChatMessage = { role: 'user' | 'assistant'; content: string }

export type CallAiArgs = {
  provider: AiProvider
  /** A single user message. Ignored when `messages` is given. */
  prompt?: string
  image?: AiImage
  maxTokens?: number
  /** System instructions. Anthropic gets it as the top-level `system`; OpenAI as a first system message. */
  system?: string
  /** Overrides the provider's default model for this call. */
  model?: string
  /** Multi-turn conversation, used instead of `prompt` when given. */
  messages?: AiChatMessage[]
  temperature?: number
}

type ChatRequestBody = { model: string; max_tokens: number; messages: unknown[]; system?: string; temperature?: number }

export type CallAiOptions = {
  /** The provider's API key, already decrypted. */
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}

/** A failure the admin can act on. The message is safe to show. */
export class AiError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'AiError'
    this.status = status
  }
}

const base64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** The request body for Anthropic's Messages API. Pure, so the shape can be asserted directly. */
export function buildAnthropicRequest(args: CallAiArgs): ChatRequestBody {
  let messages: unknown[]
  if (args.messages) {
    messages = args.messages.map((message) => ({ role: message.role, content: message.content }))
  } else {
    const content: unknown[] = []
    if (args.image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: args.image.mimeType, data: base64(args.image.data) },
      })
    }
    content.push({ type: 'text', text: args.prompt ?? '' })
    messages = [{ role: 'user', content }]
  }
  const body: ChatRequestBody = {
    model: args.model ?? AI_MODELS.claude,
    max_tokens: args.maxTokens ?? 200,
    messages,
  }
  if (args.system) body.system = args.system
  if (args.temperature !== undefined) body.temperature = args.temperature
  return body
}

/** The request body for OpenAI's Chat Completions API. Pure. */
export function buildOpenAiRequest(args: CallAiArgs): ChatRequestBody {
  let messages: unknown[]
  if (args.messages) {
    messages = args.messages.map((message) => ({ role: message.role, content: message.content }))
  } else {
    const content: unknown[] = [{ type: 'text', text: args.prompt ?? '' }]
    if (args.image) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${args.image.mimeType};base64,${base64(args.image.data)}` },
      })
    }
    messages = [{ role: 'user', content }]
  }
  if (args.system) messages = [{ role: 'system', content: args.system }, ...messages]
  const body: ChatRequestBody = {
    model: args.model ?? AI_MODELS.openai,
    max_tokens: args.maxTokens ?? 200,
    messages,
  }
  if (args.temperature !== undefined) body.temperature = args.temperature
  return body
}

/** Pulls the text out of either provider's response. Returns '' when there is none. */
export function extractText(provider: AiProvider, body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  if (provider === 'claude') {
    const blocks = (body as { content?: unknown }).content
    if (!Array.isArray(blocks)) return ''
    return blocks
      .map((block) => (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' ? String((block as { text?: unknown }).text ?? '') : ''))
      .join('')
      .trim()
  }
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return ''
  const message = (choices[0] as { message?: { content?: unknown } }).message
  return typeof message?.content === 'string' ? message.content.trim() : ''
}

export type AiUsage = { inputTokens: number; outputTokens: number }

/** Token counts the provider reported, or null when the response carries none. */
export function extractUsage(provider: AiProvider, body: unknown): AiUsage | null {
  if (!body || typeof body !== 'object') return null
  const usage = (body as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const input = provider === 'claude' ? u.input_tokens : u.prompt_tokens
  const output = provider === 'claude' ? u.output_tokens : u.completion_tokens
  if (typeof input !== 'number' || typeof output !== 'number' || !Number.isFinite(input) || !Number.isFinite(output)) return null
  return { inputTokens: Math.max(0, Math.round(input)), outputTokens: Math.max(0, Math.round(output)) }
}

/** Maps an HTTP status to a message the admin can act on. */
export function messageForStatus(provider: AiProvider, status: number): string {
  const name = provider === 'claude' ? 'Claude' : 'OpenAI'
  if (status === 401 || status === 403) return `${name} rejected the API key. Check it in Integrations.`
  if (status === 429) return `${name} rate limit reached. Wait a minute and try again.`
  if (status === 400 || status === 413 || status === 415) return `${name} could not read this picture.`
  if (status >= 500) return `${name} is unavailable right now. Try again shortly.`
  return `${name} returned an unexpected error (${status}).`
}

/**
 * Sends one request and returns the model's text. Throws AiError for every
 * failure, including timeouts, so callers have one shape to handle.
 */
export async function callAi(args: CallAiArgs, options: CallAiOptions): Promise<string> {
  return (await callAiDetailed(args, options)).text
}

/** Like callAi, and also returns the provider's token counts (null when it sent none). */
export async function callAiDetailed(args: CallAiArgs, options: CallAiOptions): Promise<{ text: string; usage: AiUsage | null }> {
  if (!options.apiKey) {
    throw new AiError(`No ${args.provider === 'claude' ? 'Claude' : 'OpenAI'} API key is set in Integrations.`)
  }

  const fetchImpl = options.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_TIMEOUT_MS)

  const request =
    args.provider === 'claude'
      ? {
          url: ANTHROPIC_URL,
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: buildAnthropicRequest(args),
        }
      : {
          url: OPENAI_URL,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: buildOpenAiRequest(args),
        }

  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    })
    if (!response.ok) throw new AiError(messageForStatus(args.provider, response.status), response.status)

    const payload = await response.json().catch((): null => null)
    const text = extractText(args.provider, payload)
    if (!text) throw new AiError('The model returned no text for this picture.')
    return { text, usage: extractUsage(args.provider, payload) }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiError(`${args.provider === 'claude' ? 'Claude' : 'OpenAI'} took too long to respond.`)
    }
    throw new AiError(`${args.provider === 'claude' ? 'Claude' : 'OpenAI'} could not be reached.`)
  } finally {
    clearTimeout(timer)
  }
}

/** Thrown when the runtime or provider cannot stream, so the caller may retry without streaming. */
export class AiStreamUnsupportedError extends AiError {}

export type StreamHandlers = {
  /** Called with the running character count as text arrives. */
  onProgress?: (chars: number) => void
}

/**
 * Like callAiDetailed, but asks the provider to stream and reports progress as it goes.
 * Returns the same shape once the stream ends. Any stream failure is an AiError; a missing
 * body reader is AiStreamUnsupportedError.
 */
export async function streamAiDetailed(
  args: CallAiArgs,
  options: CallAiOptions,
  handlers: StreamHandlers = {},
): Promise<{ text: string; usage: AiUsage | null }> {
  const name = args.provider === 'claude' ? 'Claude' : 'OpenAI'
  if (!options.apiKey) throw new AiError(`No ${name} API key is set in Integrations.`)
  const fetchImpl = options.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_TIMEOUT_MS)
  const claude = args.provider === 'claude'
  const body = claude
    ? { ...buildAnthropicRequest(args), stream: true }
    : { ...buildOpenAiRequest(args), stream: true, stream_options: { include_usage: true } }
  try {
    const response = await fetchImpl(claude ? ANTHROPIC_URL : OPENAI_URL, {
      method: 'POST',
      headers: claude
        ? { 'content-type': 'application/json', 'x-api-key': options.apiKey, 'anthropic-version': ANTHROPIC_VERSION }
        : { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new AiError(messageForStatus(args.provider, response.status), response.status)
    const reader = response.body?.getReader?.()
    if (!reader) throw new AiStreamUnsupportedError(`${name} did not stream a response.`)

    const decoder = new TextDecoder()
    const parser = createSseParser()
    const acc = createStreamAccumulator()
    const take = (chunk: string) => {
      const before = acc.text.length
      for (const message of chunk ? parser.feed(chunk) : parser.flush()) acc.add(parseProviderEvent(args.provider, message))
      if (acc.text.length !== before) handlers.onProgress?.(acc.text.length)
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      take(decoder.decode(value, { stream: true }))
      if (acc.done) break
    }
    take('')
    if (acc.error) throw new AiError(acc.error)
    const text = acc.text.trim()
    if (!text) throw new AiError('The model returned no text for this picture.')
    return { text, usage: acc.usage }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (error instanceof Error && error.name === 'AbortError') throw new AiError(`${name} took too long to respond.`)
    throw new AiError(`${name} could not be reached.`)
  } finally {
    clearTimeout(timer)
  }
}
