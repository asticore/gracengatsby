import { NextResponse } from 'next/server'

import { getAdminContext, type AdminContext } from '@/admin/auth'
import { AiError, callAi, type AiChatMessage } from '@/features/ai/client'
import { AI_BUILDER_MODELS, type AiProvider } from '@/features/ai/models'
import { aiKeyAvailability, readAiKey } from '@/features/ai/keys'
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
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'

export const dynamic = 'force-dynamic'

/** Builder replies are whole sections, so they get more room than alt text. */
const BUILDER_MAX_TOKENS = 8000
const BUILDER_TIMEOUT_MS = 90_000

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

/** GET - which providers have a key. Presence only; no key is ever sent to the browser. */
export async function GET(): Promise<Response> {
  const auth = await authorizeBuilder()
  if (!auth.context) return auth.response
  return json({ providers: await aiKeyAvailability(), labels: BUILDER_PROVIDER_LABELS })
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
 * { action: 'plan' | 'build', provider, mode: 'section' | 'page' | 'edit', brief, examples?, answers?, outline?, selection?, pageTitle? }
 *
 * plan  -> { ok, questions } or { ok, outline }
 * build -> { ok, sections, warnings }. An invalid reply is retried once with the error fed back.
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

  const guide = { mode: req.mode }
  const common = { provider, model: AI_BUILDER_MODELS[provider], maxTokens: BUILDER_MAX_TOKENS }
  const options = { apiKey, timeoutMs: BUILDER_TIMEOUT_MS }

  try {
    if (req.action === 'plan') {
      const reply = await callAi({ ...common, system: planSystemPrompt(guide), messages: firstMessages(req, 'plan') }, options)
      const plan = parsePlanReply(reply, req.answers.length > 0)
      if (plan.ok === false) return json({ ok: false, error: plan.error }, 502)
      await recordAudit(auth.context, request, req, 0)
      return json('questions' in plan ? { ok: true, questions: plan.questions } : { ok: true, outline: plan.outline })
    }

    const system = buildSystemPrompt(guide)
    const messages: AiChatMessage[] = firstMessages(req, 'build')
    let reply = await callAi({ ...common, system, messages }, options)
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
      reply = await callAi({ ...common, system, messages: retry }, options)
      result = validateBuilderOutput(reply, { mode: req.mode })
    }

    if (result.ok === false) return json({ ok: false, error: result.error }, 502)
    await recordAudit(auth.context, request, req, result.sections.length)
    return json({ ok: true, sections: result.sections, warnings: result.warnings })
  } catch (error) {
    if (error instanceof AiError) return json({ ok: false, error: error.message }, 502)
    return json({ ok: false, error: 'The builder could not finish. Try again.' }, 500)
  }
}
