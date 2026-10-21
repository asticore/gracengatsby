import { describe, expect, it } from 'vitest'

import {
  createSseParser,
  createStreamAccumulator,
  formatBuilderEvent,
  parseBuilderEvent,
  parseProviderEvent,
  writingText,
} from '@/features/ai/streamParse'

const run = (provider: 'claude' | 'openai', raw: string, size = 7) => {
  const parser = createSseParser()
  const acc = createStreamAccumulator()
  const feed = (messages: ReturnType<typeof parser.feed>) => messages.forEach((m) => acc.add(parseProviderEvent(provider, m)))
  for (let i = 0; i < raw.length; i += size) feed(parser.feed(raw.slice(i, i + size)))
  feed(parser.flush())
  return acc
}

describe('createSseParser', () => {
  it('handles split chunks, CRLF, comments and multi-line data', () => {
    const p = createSseParser()
    expect(p.feed('event: a\r\ndata: 1\r\n')).toEqual([])
    expect(p.feed('\r\n: ping\n\ndata: x\ndata: y\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'message', data: 'x\ny' },
    ])
  })
  it('flush emits a trailing unterminated block', () => {
    const p = createSseParser()
    p.feed('data: z')
    expect(p.flush()).toEqual([{ event: 'message', data: 'z' }])
  })
})

describe('provider streams', () => {
  it('reads a Claude stream with usage', () => {
    const raw = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":25,"output_tokens":1}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"a\\""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":":1}"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":9}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('')
    const acc = run('claude', raw)
    expect(acc.text).toBe('{"a":1}')
    expect(acc.usage).toEqual({ inputTokens: 25, outputTokens: 9 })
    expect(acc.done).toBe(true)
  })
  it('reads an OpenAI stream, with and without usage', () => {
    const base = 'data: {"choices":[{"delta":{"content":"he"}}]}\n\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
    const without = run('openai', base + 'data: [DONE]\n\n')
    expect(without.text).toBe('hello')
    expect(without.usage).toBeNull()
    expect(without.done).toBe(true)
    const withUsage = run('openai', base + 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n')
    expect(withUsage.usage).toEqual({ inputTokens: 5, outputTokens: 2 })
  })
  it('ignores malformed data and surfaces provider errors', () => {
    expect(parseProviderEvent('claude', { event: 'x', data: 'nope' })).toEqual({})
    expect(parseProviderEvent('claude', { event: 'error', data: '{"type":"error","error":{"message":"secret"}}' }).error).toBe('Claude stopped the response early.')
  })
})

describe('builder events', () => {
  it('round-trips and rejects unknown events', () => {
    const text = formatBuilderEvent({ event: 'delta', data: { chars: 12 } })
    const [m] = createSseParser().feed(text)
    expect(parseBuilderEvent(m)).toEqual({ event: 'delta', data: { chars: 12 } })
    expect(parseBuilderEvent({ event: 'weird', data: '{}' })).toBeNull()
    expect(parseBuilderEvent({ event: 'delta', data: '{"chars":"x"}' })).toBeNull()
  })
  it('formats the progress line', () => {
    expect(writingText(1240)).toBe('Writing... 1,240 characters')
  })
})
