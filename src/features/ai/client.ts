/**
 * One call to a vision model, for either provider.
 *
 * Requests are made from the server only. The picture is sent as base64 bytes
 * read from R2 rather than as a URL, because the providers cannot reach this
 * app's own file route. Keys are read by the caller and never logged; error
 * messages carry the HTTP status, never a key or a response body.
 */

import { AI_MODELS, AI_TIMEOUT_MS, ANTHROPIC_URL, ANTHROPIC_VERSION, OPENAI_URL, type AiProvider } from './models'

export type AiImage = { data: Uint8Array; mimeType: string }

export type CallAiArgs = {
  provider: AiProvider
  prompt: string
  image?: AiImage
  maxTokens?: number
}

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
export function buildAnthropicRequest(args: CallAiArgs): { model: string; max_tokens: number; messages: unknown[] } {
  const content: unknown[] = []
  if (args.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: args.image.mimeType, data: base64(args.image.data) },
    })
  }
  content.push({ type: 'text', text: args.prompt })
  return {
    model: AI_MODELS.claude,
    max_tokens: args.maxTokens ?? 200,
    messages: [{ role: 'user', content }],
  }
}

/** The request body for OpenAI's Chat Completions API. Pure. */
export function buildOpenAiRequest(args: CallAiArgs): { model: string; max_tokens: number; messages: unknown[] } {
  const content: unknown[] = [{ type: 'text', text: args.prompt }]
  if (args.image) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${args.image.mimeType};base64,${base64(args.image.data)}` },
    })
  }
  return {
    model: AI_MODELS.openai,
    max_tokens: args.maxTokens ?? 200,
    messages: [{ role: 'user', content }],
  }
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

    const text = extractText(args.provider, await response.json().catch((): null => null))
    if (!text) throw new AiError('The model returned no text for this picture.')
    return text
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
