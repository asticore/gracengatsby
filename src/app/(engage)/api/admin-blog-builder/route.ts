import { NextResponse } from 'next/server'

import { getAdminContext, type AdminContext } from '@/admin/auth'
import {
  AiError,
  callAiDetailed,
  streamAiDetailed,
  type AiChatMessage,
  type CallAiArgs,
} from '@/features/ai/client'
import { resolveBuilderModel, type AiProvider } from '@/features/ai/models'
import { aiKeyAvailability, readAiKey, readBuilderSettings } from '@/features/ai/keys'
import { readSiteContext } from '@/features/ai/builderContext'
import { estimateTokensFromChars, readUsageSummary, recordUsage } from '@/features/ai/builderUsage'
import { formatBuilderEvent, type BuilderStreamEvent } from '@/features/ai/streamParse'
import { createBlogDraft } from '@/features/blogBuilder/draft'
import {
  parseDetails,
  parseOutline,
  parseSectionText,
  parseTitles,
} from '@/features/blogBuilder/parse'
import {
  detailsPrompt,
  outlinePrompt,
  sectionPrompt,
  systemPrompt,
  titlesPrompt,
} from '@/features/blogBuilder/prompts'
import {
  parseBlogRequest,
  type BlogRequest,
  type ParseResult,
} from '@/features/blogBuilder/request'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'

export const dynamic = 'force-dynamic'

const BLOG_TIMEOUT_MS = 90_000
const MAX_TOKENS = { titles: 500, outline: 900, section: 1800, details: 700 } as const

type Emit = (event: BuilderStreamEvent) => void

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * Write with AI is for people who can create posts. The AI steps write nothing; only
 * the final create call saves a draft, through the posts collection's own rules.
 */
async function authorizeBlog() {
  const context = await getAdminContext()
  if (!context.user) return { response: json({ ok: false, error: 'Please sign in again.' }, 401) }
  if (context.isAdmin || context.can('posts', 'create')) return { context }
  return {
    response: json({ ok: false, error: 'You do not have permission to create posts.' }, 403),
  }
}

/** Providers with a key, and the month's spend. Presence only: no key ever reaches the browser. */
export async function GET(): Promise<Response> {
  const auth = await authorizeBlog()
  if (!auth.context) return auth.response
  const settings = await readBuilderSettings()
  return json({
    ok: true,
    providers: await aiKeyAvailability(),
    usage: await readUsageSummary(settings.capUsd),
  })
}

async function recordAudit(
  context: AdminContext,
  request: Request,
  title: string,
  sections: number,
  postId: string,
): Promise<void> {
  try {
    const settings = await getSecuritySettings(
      context.engine as unknown as Parameters<typeof getSecuritySettings>[0],
    )
    const user = context.user as { id?: number | string; email?: string } | null
    await audit(
      {
        action: 'create',
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        detail: `Blog draft ${postId} created with AI (${sections} sections): ${title.slice(0, 80)}`,
        ...auditContext(request),
      },
      settings,
    )
  } catch {
    // The audit write logs its own failures; the draft is already saved.
  }
}

/** The provider to use: Claude when its key is set, else OpenAI. Null when neither is set. */
async function pickProvider(): Promise<AiProvider | null> {
  for (const provider of ['claude', 'openai'] as const) {
    if (await readAiKey(provider).catch((): null => null)) return provider
  }
  return null
}

/**
 * POST /api/admin-blog-builder
 * { action: 'titles' | 'outline' | 'section' | 'details' | 'create', brief?, title?, outline?, index?, sections?, meta? }
 * Replies with { ok, ... } and a 4xx/5xx status on failure. With Accept: text/event-stream the AI steps
 * send delta events (character counts) and then done or error, as the page builder does.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeBlog()
  if (!auth.context) return auth.response

  const body = await request.json().catch((): null => null)
  const parsed = parseBlogRequest(body)
  if (parsed.ok === false) return json({ ok: false, error: parsed.error }, 400)
  const req = parsed.value

  if (req.action === 'create') {
    try {
      const outline = req.outline ?? []
      const created = await createBlogDraft(
        auth.context.engine as unknown as Parameters<typeof createBlogDraft>[0],
        auth.context.user,
        {
          title: req.title ?? '',
          outline,
          sections: req.sections ?? [],
          meta: req.meta!,
        },
      )
      await recordAudit(auth.context, request, req.title ?? '', outline.length, created.id)
      return json({ ok: true, id: created.id, slug: created.slug, status: 'draft' })
    } catch {
      return json(
        { ok: false, error: 'The draft could not be saved. Check the title and try again.' },
        500,
      )
    }
  }

  const provider = await pickProvider()
  if (!provider)
    return json({ ok: false, error: 'No Claude or OpenAI API key is set in Integrations.' }, 400)

  const settings = await readBuilderSettings()
  const before = await readUsageSummary(settings.capUsd)
  if (before.capReached) {
    return json(
      {
        ok: false,
        code: 'cap_reached',
        error: `The monthly Build with AI spend cap ($${before.capUsd.toFixed(2)}) has been reached. Raise or clear the cap in Integrations to continue.`,
        usage: before,
      },
      429,
    )
  }

  const apiKey = (await readAiKey(provider))!
  const model = resolveBuilderModel(provider, settings.models[provider])
  const site = await readSiteContext()
  const system = systemPrompt(site)
  const user = auth.context.user as { id?: number | string } | null
  const userId = user?.id !== undefined && user?.id !== null ? String(user.id) : null
  const options = { apiKey, timeoutMs: BLOG_TIMEOUT_MS }
  let estimated = false

  /** One provider call, recorded in the usage table (counts only: never the brief or the output). */
  const ask = async (args: CallAiArgs, emit?: Emit): Promise<string> => {
    try {
      let result: { text: string; usage: { inputTokens: number; outputTokens: number } | null }
      if (emit) {
        try {
          result = await streamAiDetailed(args, options, {
            onProgress: (chars) => emit({ event: 'delta', data: { chars } }),
          })
        } catch (error) {
          const status = error instanceof AiError ? error.status : null
          if (status === 401 || status === 403 || status === 429 || status === 400) throw error
          result = await callAiDetailed(args, options)
        }
        if (result.usage) emit({ event: 'usage', data: result.usage })
      } else {
        result = await callAiDetailed(args, options)
      }
      const inChars =
        (args.system?.length ?? 0) +
        (args.messages ?? []).reduce((sum, m) => sum + m.content.length, 0)
      if (!result.usage) estimated = true
      await recordUsage({
        userId,
        provider,
        model,
        mode: 'blog',
        inputTokens: result.usage?.inputTokens ?? estimateTokensFromChars(inChars),
        outputTokens: result.usage?.outputTokens ?? estimateTokensFromChars(result.text.length),
        ok: true,
        estimated: !result.usage,
      })
      return result.text
    } catch (error) {
      await recordUsage({
        userId,
        provider,
        model,
        mode: 'blog',
        inputTokens: 0,
        outputTokens: 0,
        ok: false,
      })
      throw error
    }
  }

  /** Asks, parses, and retries once with the error fed back if the reply is unusable. */
  const askParsed = async <T>(
    prompt: string,
    maxTokens: number,
    parse: (reply: string) => ParseResult<T>,
    emit?: Emit,
  ): Promise<T> => {
    const messages: AiChatMessage[] = [{ role: 'user', content: prompt }]
    const reply = await ask({ provider, model, maxTokens, system, messages }, emit)
    const first = parse(reply)
    if (first.ok === true) return first.value
    const retry: AiChatMessage[] = [
      ...messages,
      { role: 'assistant', content: reply },
      {
        role: 'user',
        content: `That reply could not be used: ${first.error} Reply again in the required format only.`,
      },
    ]
    const second = parse(await ask({ provider, model, maxTokens, system, messages: retry }, emit))
    if (second.ok === true) return second.value
    throw new AiError(second.error)
  }

  const execute = async (emit?: Emit): Promise<Record<string, unknown>> => {
    const r = req as BlogRequest & { brief: NonNullable<BlogRequest['brief']>; title: string }
    if (r.action === 'titles') {
      const titles = await askParsed(titlesPrompt(r.brief), MAX_TOKENS.titles, parseTitles, emit)
      return { titles }
    }
    if (r.action === 'outline') {
      const outline = await askParsed(
        outlinePrompt(r.brief, r.title),
        MAX_TOKENS.outline,
        parseOutline,
        emit,
      )
      return { outline }
    }
    if (r.action === 'section') {
      const outline = r.outline!
      const index = r.index!
      const text = await askParsed(
        sectionPrompt(r.brief, r.title, outline, index, r.sections ?? []),
        MAX_TOKENS.section,
        parseSectionText,
        emit,
      )
      return { text, index }
    }
    // details
    const meta = await askParsed(
      detailsPrompt(r.brief, r.title, r.outline!, r.sections ?? []),
      MAX_TOKENS.details,
      (reply) => parseDetails(reply, r.title),
      emit,
    )
    return { meta }
  }

  const finish = async (payload: Record<string, unknown>) => ({
    ...payload,
    provider,
    model,
    usage: await readUsageSummary(settings.capUsd),
    usageEstimated: estimated,
  })

  const failure = (error: unknown): { body: Record<string, unknown>; status: number } =>
    error instanceof AiError
      ? { body: { ok: false, error: error.message }, status: 502 }
      : { body: { ok: false, error: 'The blog builder could not finish. Try again.' }, status: 500 }

  const wantsStream = (request.headers.get('accept') ?? '').includes('text/event-stream')
  if (!wantsStream) {
    try {
      return json(await finish({ ok: true, ...(await execute()) }))
    } catch (error) {
      const { body: payload, status } = failure(error)
      return json(payload, status)
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        try {
          controller.enqueue(encoder.encode(formatBuilderEvent(event)))
        } catch {
          // The browser went away; the work still finishes and is recorded.
        }
      }
      try {
        emit({ event: 'done', data: await finish({ ok: true, ...(await execute(emit)) }) })
      } catch (error) {
        const { body: payload, status } = failure(error)
        emit({ event: 'error', data: { error: String(payload.error), status } })
      }
      try {
        controller.close()
      } catch {
        // already closed
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
