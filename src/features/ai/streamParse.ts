/**
 * Pure helpers for server-sent events: the provider streams the route reads, and the
 * delta/usage/done/error stream the route sends to the browser. No node-only APIs, so
 * it runs in Cloudflare Workers and in the browser alike.
 */

export type SseMessage = { event: string; data: string }

/** Incremental SSE parser. Feed text chunks as they arrive; complete messages come back. */
export function createSseParser(): { feed: (chunk: string) => SseMessage[]; flush: () => SseMessage[] } {
  let buffer = ''
  const parseBlock = (block: string): SseMessage | null => {
    let event = 'message'
    const data: string[] = []
    for (const raw of block.split('\n')) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (!line || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    return data.length ? { event, data: data.join('\n') } : null
  }
  const drain = (final: boolean): SseMessage[] => {
    const out: SseMessage[] = []
    buffer = buffer.replace(/\r\n/g, '\n')
    let index = buffer.indexOf('\n\n')
    while (index !== -1) {
      const message = parseBlock(buffer.slice(0, index))
      if (message) out.push(message)
      buffer = buffer.slice(index + 2)
      index = buffer.indexOf('\n\n')
    }
    if (final && buffer.trim()) {
      const message = parseBlock(buffer)
      if (message) out.push(message)
      buffer = ''
    }
    return out
  }
  return {
    feed(chunk) {
      buffer += chunk
      return drain(false)
    },
    flush: () => drain(true),
  }
}

export type ProviderStreamStep = {
  text?: string
  inputTokens?: number
  outputTokens?: number
  done?: boolean
  error?: string
}

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined

/** Reads one provider SSE message. Unknown or malformed messages yield an empty step. */
export function parseProviderEvent(provider: 'claude' | 'openai', message: SseMessage): ProviderStreamStep {
  if (provider === 'openai' && message.data.trim() === '[DONE]') return { done: true }
  let payload: unknown
  try {
    payload = JSON.parse(message.data)
  } catch {
    return {}
  }
  if (!payload || typeof payload !== 'object') return {}
  const p = payload as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (provider === 'claude') {
    switch (p.type) {
      case 'content_block_delta':
        return p.delta?.type === 'text_delta' && typeof p.delta.text === 'string' ? { text: p.delta.text } : {}
      case 'message_start':
        return { inputTokens: num(p.message?.usage?.input_tokens), outputTokens: num(p.message?.usage?.output_tokens) }
      case 'message_delta':
        return { outputTokens: num(p.usage?.output_tokens), inputTokens: num(p.usage?.input_tokens) }
      case 'message_stop':
        return { done: true }
      case 'error':
        return { error: 'Claude stopped the response early.' }
      default:
        return {}
    }
  }
  if (p.error) return { error: 'OpenAI stopped the response early.' }
  const step: ProviderStreamStep = {}
  const content = Array.isArray(p.choices) ? p.choices[0]?.delta?.content : undefined
  if (typeof content === 'string' && content) step.text = content
  if (p.usage && typeof p.usage === 'object') {
    step.inputTokens = num(p.usage.prompt_tokens)
    step.outputTokens = num(p.usage.completion_tokens)
  }
  return step
}

/** Folds provider steps into the text so far and the latest token counts. */
export function createStreamAccumulator() {
  let text = ''
  let input: number | undefined
  let output: number | undefined
  let done = false
  let error: string | null = null
  return {
    add(step: ProviderStreamStep): void {
      if (step.text) text += step.text
      if (step.inputTokens !== undefined) input = step.inputTokens
      if (step.outputTokens !== undefined) output = step.outputTokens
      if (step.done) done = true
      if (step.error) error = step.error
    },
    get text() {
      return text
    },
    get done() {
      return done
    },
    get error() {
      return error
    },
    /** Real counts only when the provider sent both. */
    get usage(): { inputTokens: number; outputTokens: number } | null {
      return input !== undefined && output !== undefined ? { inputTokens: input, outputTokens: output } : null
    },
  }
}

export type BuilderStreamEvent =
  | { event: 'delta'; data: { chars: number } }
  | { event: 'usage'; data: { inputTokens: number; outputTokens: number } }
  | { event: 'done'; data: Record<string, unknown> }
  | { event: 'error'; data: { error: string; status?: number } }

/** Encodes one event for the browser. */
export function formatBuilderEvent(event: BuilderStreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
}

/** Decodes a browser-side message into a typed event, or null when it is not one we know. */
export function parseBuilderEvent(message: SseMessage): BuilderStreamEvent | null {
  let data: unknown
  try {
    data = JSON.parse(message.data)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  switch (message.event) {
    case 'delta':
      return typeof d.chars === 'number' ? { event: 'delta', data: { chars: d.chars } } : null
    case 'usage':
      return typeof d.inputTokens === 'number' && typeof d.outputTokens === 'number'
        ? { event: 'usage', data: { inputTokens: d.inputTokens, outputTokens: d.outputTokens } }
        : null
    case 'done':
      return { event: 'done', data: d }
    case 'error':
      return { event: 'error', data: { error: typeof d.error === 'string' ? d.error : 'The builder could not finish.', status: typeof d.status === 'number' ? d.status : undefined } }
    default:
      return null
  }
}

/** "Writing... 1,240 characters" */
export function writingText(chars: number): string {
  return `Writing... ${Math.max(0, Math.round(chars)).toLocaleString('en-US')} characters`
}
