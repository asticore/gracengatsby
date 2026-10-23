import { NextResponse } from 'next/server'

import { getAdminContext, type AdminContext } from '@/admin/auth'
import { AiError, callAiDetailed, streamAiDetailed, type AiChatMessage, type CallAiArgs } from '@/features/ai/client'
import { AI_BUILDER_MODEL_OPTIONS, resolveBuilderModel, type AiProvider } from '@/features/ai/models'
import { aiKeyAvailability, readAiKey, readBuilderSettings } from '@/features/ai/keys'
import { readSiteContext } from '@/features/ai/builderContext'
import { engineMediaFinder, resolveMediaPlaceholders } from '@/features/ai/builderMedia'
import { estimateTokensFromChars, readUsageSummary, recordUsage } from '@/features/ai/builderUsage'
import {
  BUILDER_PROVIDER_LABELS,
  buildSystemPrompt,
  firstMessages,
  parseBuilderRequest,
  parsePlanReply,
  planSystemPrompt,
  type BuilderRequest,
} from '@/features/ai/builderRequest'
import { validateBuilderOutput } from '@/features/ai/builderValidate'
import { formatBuilderEvent, type BuilderStreamEvent } from '@/features/ai/streamParse'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'

export const dynamic = 'force-dynamic'

/** Builder replies are whole sections, so they get more room than alt text. */
const BUILDER_MAX_TOKENS = 8000
const BUILDER_TIMEOUT_MS = 90_000

type Emit = (event: BuilderStreamEvent) => void

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * Editor-level access: admins, or anyone whose role may update pages. The builder
 * writes content for pages, so it follows the pages update permission.
 */
async function authorizeBuilder() {
  const context = await getAdminContext()
  if (!context.user) return { response: json({ ok: false, error: 'Please sign in again.' }, 401) }
  if (context.isAdmin || context.can('pages', 'update')) return { context }
  return { response: json({ ok: false, error: 'You do not have permission to edit pages.' }, 403) }
}

/**
 * GET - which providers have a key, the configured model per provider and the month-to-date spend.
 * Presence only for keys; no key is ever sent to the browser.
 * { providers, labels, models: { claude: { selected, options: [{ value, label }] }, openai: {...} }, usage: UsageSummary }
 */
export async function GET(): Promise<Response> {
  const auth = await authorizeBuilder()
  if (!auth.context) return auth.response
  const settings = await readBuilderSettings()
  const models = {} as Record<AiProvider, { selected: string; options: { value: string; label: string }[] }>
  for (const provider of Object.keys(AI_BUILDER_MODEL_OPTIONS) as AiProvider[]) {
    models[provider] = {
      selected: settings.models[provider],
      options: AI_BUILDER_MODEL_OPTIONS[provider].map(({ value, label }) => ({ value, label })),
    }
  }
  return json({
    providers: await aiKeyAvailability(),
    labels: BUILDER_PROVIDER_LABELS,
    models,
    usage: await readUsageSummary(settings.capUsd),
  })
}

/** Counts only, so the audit trail never holds the brief, the examples or the output. */
async function recordAudit(
  context: AdminContext,
  request: Request,
  req: BuilderRequest,
  sections: number,
): Promise<void> {
  try {
    const settings = await getSecuritySettings(context.engine as unknown as Parameters<typeof getSecuritySettings>[0])
    const user = context.user as { id?: number | string; email?: string } | null
    await audit(
      {
        action: 'update',
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        detail: `AI builder ${req.action} with ${req.provider}: mode ${req.mode}, ${req.examples.length} examples, ${sections} sections`,
        ...auditContext(request),
      },
      settings,
    )
  } catch {
    // The audit write logs its own failures; a missing entry must not fail the request.
  }
}

/**
 * POST /api/admin-ai-builder
 * { action: 'plan' | 'build', provider, mode: 'section' | 'page' | 'edit', brief, examples?, answers?, outline?, selection?, pageTitle?,
 *   model? (must be on the allowlist), history? ([{ role, text }] max 6), current? (previous sections JSON to refine) }
 *
 * plan  -> { ok, questions } or { ok, outline }
 * build -> { ok, sections, warnings, model, mediaResolved, unresolvedMedia: [{ elementType, field, query, alt }], usage, usageEstimated }.
 *   An invalid reply is retried once with the error fed back. Over the monthly cap -> 429 { ok:false, code:'cap_reached', error, usage }.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeBuilder()
  if (!auth.context) return auth.response

  const body = await request.json().catch((): null => null)
  const parsed = parseBuilderRequest(body)
  if (parsed.ok === false) return json({ ok: false, error: parsed.error }, 400)
  const req = parsed.value

  const provider: AiProvider = req.provider
  const name = BUILDER_PROVIDER_LABELS[provider]
  const apiKey = await readAiKey(provider).catch((): null => null)
  if (!apiKey) return json({ ok: false, error: `No ${name} API key is set in Integrations.` }, 400)

  const settings = await readBuilderSettings()
  const before = await readUsageSummary(settings.capUsd)
  if (before.capReached) {
    return json(
      {
        ok: false,
        code: 'cap_reached',
        error: `The monthly Build with AI spend cap ($${before.capUsd.toFixed(2)}) has been reached (about $${before.estCostUsd.toFixed(2)} used this month). Raise or clear the cap in Integrations to continue.`,
        usage: before,
      },
      429,
    )
  }

  const model = resolveBuilderModel(provider, req.model, settings.models[provider])
  const guide = { ...(await readSiteContext()), mode: req.mode }
  const common = { provider, model, maxTokens: BUILDER_MAX_TOKENS }
  const options = { apiKey, timeoutMs: BUILDER_TIMEOUT_MS }
  const user = auth.context.user as { id?: number | string } | null
  const userId = user?.id !== undefined && user?.id !== null ? String(user.id) : null
  // True when any call's token counts are a chars/4 estimate because the provider sent none.
  let estimated = false

  /** One provider call, recorded in the usage table (counts only). */
  const ask = async (args: CallAiArgs, emit?: Emit): Promise<string> => {
    try {
      let result: { text: string; usage: { inputTokens: number; outputTokens: number } | null }
      if (emit) {
        try {
          result = await streamAiDetailed(args, options, { onProgress: (chars) => emit({ event: 'delta', data: { chars } }) })
        } catch (error) {
          // Streaming unsupported or failed: one plain retry. Key, rate-limit and quota errors are not retried.
          const status = error instanceof AiError ? error.status : null
          if (status === 401 || status === 403 || status === 429 || status === 400) throw error
          result = await callAiDetailed(args, options)
        }
        if (result.usage) emit({ event: 'usage', data: result.usage })
      } else {
        result = await callAiDetailed(args, options)
      }
      const { text, usage } = result
      const inChars = (args.system?.length ?? 0) + (args.messages ?? []).reduce((sum, m) => sum + m.content.length, 0)
      if (!usage) estimated = true
      await recordUsage({
        userId,
        provider,
        model,
        mode: req.mode,
        inputTokens: usage?.inputTokens ?? estimateTokensFromChars(inChars),
        outputTokens: usage?.outputTokens ?? estimateTokensFromChars(text.length),
        ok: true,
        estimated: !usage,
      })
      return text
    } catch (error) {
      await recordUsage({ userId, provider, model, mode: req.mode, inputTokens: 0, outputTokens: 0, ok: false })
      throw error
    }
  }
  const usageNow = async () => readUsageSummary(settings.capUsd)

  /** The whole plan/build flow. Returns the JSON body and status, so both response styles share it. */
  const execute = async (emit?: Emit): Promise<{ body: Record<string, unknown>; status: number }> => {
    const out = (body: Record<string, unknown>, status = 200) => ({ body, status })
    if (req.action === 'plan') {
      const reply = await ask({ ...common, system: planSystemPrompt(guide), messages: firstMessages(req, 'plan') }, emit)
      const plan = parsePlanReply(reply, req.answers.length > 0)
      if (plan.ok === false) return out({ ok: false, error: plan.error }, 502)
      await recordAudit(auth.context, request, req, 0)
      const extra = { model, usage: await usageNow(), usageEstimated: estimated }
      return out('questions' in plan ? { ok: true, questions: plan.questions, ...extra } : { ok: true, outline: plan.outline, ...extra })
    }

    const system = buildSystemPrompt(guide)
    const messages: AiChatMessage[] = firstMessages(req, 'build')
    let reply = await ask({ ...common, system, messages }, emit)
    let result = validateBuilderOutput(reply, { mode: req.mode })

    if (result.ok === false) {
      const retry: AiChatMessage[] = [
        ...messages,
        { role: 'assistant', content: reply },
        {
          role: 'user',
          content: `That reply could not be used: ${result.error} Reply again with only the corrected engage-template JSON object, following the same rules.`,
        },
      ]
      reply = await ask({ ...common, system, messages: retry }, emit)
      result = validateBuilderOutput(reply, { mode: req.mode })
    }

    if (result.ok === false) return out({ ok: false, error: result.error }, 502)
    // Picture placeholders become library ids, or are removed and reported so the admin can choose.
    const media = await resolveMediaPlaceholders(
      result.sections,
      engineMediaFinder(auth.context.engine as unknown as Parameters<typeof engineMediaFinder>[0]),
    )
    await recordAudit(auth.context, request, req, result.sections.length)
    return out({
      ok: true,
      sections: result.sections,
      warnings: result.warnings,
      model,
      mediaResolved: media.resolved,
      unresolvedMedia: media.unresolved,
      usage: await usageNow(),
      usageEstimated: estimated,
    })
  }

  const failure = (error: unknown): { body: Record<string, unknown>; status: number } =>
    error instanceof AiError
      ? { body: { ok: false, error: error.message }, status: 502 }
      : { body: { ok: false, error: 'The builder could not finish. Try again.' }, status: 500 }

  const wantsStream = (request.headers.get('accept') ?? '').includes('text/event-stream')
  if (!wantsStream) {
    try {
      const { body: payload, status } = await execute()
      return json(payload, status)
    } catch (error) {
      const { body: payload, status } = failure(error)
      return json(payload, status)
    }
  }

  // Progress stream: delta (character count only), usage, then done (the same validated body) or error.
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
        const { body: payload, status } = await execute(emit)
        if (payload.ok === true) emit({ event: 'done', data: payload })
        else emit({ event: 'error', data: { error: String(payload.error ?? 'The builder could not finish.'), status } })
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
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
  })
}
