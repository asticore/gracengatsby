/**
 * Browser side of the blog builder: calls /api/admin-blog-builder and reads its progress stream.
 * Errors are AiError-like messages from the server; they are shown as they are.
 */

import { createSseParser, parseBuilderEvent, type SseMessage } from '@/features/ai/streamParse'
import type { BlogBrief, BlogMeta, BlogOutlineItem } from '../request'

export const BLOG_BUILDER_ENDPOINT = '/api/admin-blog-builder'

export class BlogBuilderError extends Error {
  readonly code: string | null
  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'BlogBuilderError'
    this.code = code
  }
}

export type BlogUsage = {
  month: string
  calls: number
  estCostUsd: number
  capUsd: number
  capReached: boolean
}

export type BlogStatus = { providers: { claude: boolean; openai: boolean }; usage: BlogUsage }

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

function failureText(data: unknown, status: number): BlogBuilderError {
  const record = asRecord(data)
  const message =
    typeof record?.error === 'string' ? record.error : `The request failed (${status}).`
  return new BlogBuilderError(message, typeof record?.code === 'string' ? record.code : null)
}

/** Which providers have a key, and this month's spend. */
export async function fetchBlogStatus(signal?: AbortSignal): Promise<BlogStatus> {
  const res = await fetch(BLOG_BUILDER_ENDPOINT, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  })
  const data = await readJson(res)
  const record = asRecord(data)
  if (!res.ok || !record?.ok) throw failureText(data, res.status)
  const providers = asRecord(record.providers) ?? {}
  const usage = asRecord(record.usage) ?? {}
  return {
    providers: { claude: providers.claude === true, openai: providers.openai === true },
    usage: {
      month: String(usage.month ?? ''),
      calls: Number(usage.calls) || 0,
      estCostUsd: Number(usage.estCostUsd) || 0,
      capUsd: Number(usage.capUsd) || 0,
      capReached: usage.capReached === true,
    },
  }
}

export type BlogStepBody =
  | { action: 'titles'; brief: BlogBrief }
  | { action: 'outline'; brief: BlogBrief; title: string }
  | {
      action: 'section'
      brief: BlogBrief
      title: string
      outline: BlogOutlineItem[]
      index: number
      sections: string[]
    }
  | {
      action: 'details'
      brief: BlogBrief
      title: string
      outline: BlogOutlineItem[]
      sections: string[]
    }
  | {
      action: 'create'
      title: string
      outline: BlogOutlineItem[]
      sections: string[]
      meta: BlogMeta
    }

/**
 * POST one step. AI steps stream: onProgress gets the running character count. Resolves
 * with the step's own fields (titles, outline, text, meta, or id/slug for create).
 */
export async function postBlogStep(
  body: BlogStepBody,
  options: { signal?: AbortSignal; onProgress?: (chars: number) => void } = {},
): Promise<Record<string, unknown>> {
  const streaming = body.action !== 'create' && options.onProgress !== undefined
  const res = await fetch(BLOG_BUILDER_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: streaming ? 'text/event-stream, application/json' : 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (
    streaming &&
    res.ok &&
    (res.headers.get('content-type') ?? '').includes('text/event-stream') &&
    res.body
  ) {
    return readStep(res.body, options.onProgress!)
  }
  const data = await readJson(res)
  const record = asRecord(data)
  if (!res.ok || !record?.ok) throw failureText(data, res.status)
  return record
}

/** Reads the progress stream. Progress is a character count; the result comes from 'done'. */
async function readStep(
  stream: ReadableStream<Uint8Array>,
  onProgress: (chars: number) => void,
): Promise<Record<string, unknown>> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  let result: Record<string, unknown> | null = null
  const handle = (messages: SseMessage[]) => {
    for (const message of messages) {
      const event = parseBuilderEvent(message)
      if (!event) continue
      if (event.event === 'delta') onProgress(event.data.chars)
      else if (event.event === 'done') result = event.data
      else if (event.event === 'error') throw new BlogBuilderError(event.data.error)
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    handle(parser.feed(decoder.decode(value, { stream: true })))
  }
  handle(parser.flush())
  if (!result || asRecord(result)?.ok !== true)
    throw new BlogBuilderError('The blog builder stopped before finishing. Try again.')
  return result
}
