import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { adminRequestRefusal } from '@/features/forms/origin'
import { brandPatch, parseDesignSave, resetPatch, templatePatch, type DesignSaveRequest } from '@/features/email/designerSave'

export const dynamic = 'force-dynamic'

type DesignEngine = {
  findGlobal: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  updateGlobal: (args: Record<string, unknown>) => Promise<unknown>
}

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** The current body wording of one template, kept when only the design or subject changes. */
const currentBody = (stored: Record<string, unknown> | null, key: string): string | null => {
  const group = stored?.[key] as { body?: unknown } | null | undefined
  return typeof group?.body === 'string' && group.body.trim() ? group.body : null
}

/** Writes one save request to the right global. */
const apply = async (engine: DesignEngine, user: unknown, request: DesignSaveRequest): Promise<void> => {
  if (request.kind === 'brand') {
    await engine.updateGlobal({ slug: 'email-brand', data: brandPatch(request.brand, request.logo), user })
    return
  }
  const stored = await engine.findGlobal({ slug: 'email-templates', depth: 0, user })
  const data =
    request.kind === 'reset'
      ? resetPatch(request.key)
      : templatePatch(request.key, request.subject, request.blocks, currentBody(stored, request.key))
  await engine.updateGlobal({ slug: 'email-templates', data, user })
}

/**
 * POST /api/admin-email-design
 *   { kind: 'template', key, subject, blocks }  saves one template's subject and design
 *   { kind: 'reset', key }                       back to the built-in wording, design removed
 *   { kind: 'brand', brand }                     the brand settings used by designed emails
 *
 * Admins only. Every value is checked on the server before it is written.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return json({ error: refusal }, 403)

    const context = await getAdminContext()
    if (!context.user) return json({ error: 'Unauthorised' }, 401)
    if (!context.isAdmin) return json({ error: 'Forbidden' }, 403)

    const body: unknown = await request.json().catch((): null => null)
    const parsed = parseDesignSave(body)
    if (parsed.ok === false) return json({ error: parsed.error }, 400)

    await apply(context.engine as unknown as DesignEngine, context.user, parsed.request)
    return json({ ok: true })
  } catch (error) {
    console.error('admin-email-design POST error:', error)
    return json({ error: 'The design could not be saved. Try again.' }, 500)
  }
}
