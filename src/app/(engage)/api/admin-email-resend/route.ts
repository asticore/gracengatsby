import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { parseId } from '@/admin/views/results/rows'
import { sendEmail } from '@/features/email'
import { EMAIL_LOG_SLUG, RESEND_INTERVAL_MS, resendRefusal, type ResendRefusal } from '@/features/email/emailLog'
import { adminRequestRefusal } from '@/features/forms/origin'

export const dynamic = 'force-dynamic'

type ResendEngine = {
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
}

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/admin-email-resend  { id }
 *
 * Sends a logged email again, to the same recipient, using the subject and body
 * kept in its log entry. The new send is logged too, with `resentFrom` set to
 * the original entry. Admins only.
 *
 * Refused (with the reason) for entries whose body was never kept, entries cut
 * short at the length cap, and entries already resent within the last minute.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return json({ error: refusal }, 403)

    const context = await getAdminContext()
    if (!context.user) return json({ error: 'Unauthorised' }, 401)
    if (!context.isAdmin) return json({ error: 'Forbidden' }, 403)

    const body = (await request.json().catch((): null => null)) as { id?: unknown } | null
    const id = parseId(body && (typeof body.id === 'number' || typeof body.id === 'string') ? String(body.id) : null)
    if (id === null) return json({ error: 'Choose which email to send again.' }, 400)

    const engine = context.engine as unknown as ResendEngine
    const row = await engine.findByID({ collection: EMAIL_LOG_SLUG, id, depth: 0, overrideAccess: true }).catch((): null => null)

    const sinceIso = new Date(Date.now() - RESEND_INTERVAL_MS).toISOString()
    const recent = row
      ? await engine.find({
          collection: EMAIL_LOG_SLUG,
          where: { and: [{ resentFrom: { equals: id } }, { createdAt: { greater_than_equal: sinceIso } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] }
    const lastResentAt = typeof recent.docs[0]?.createdAt === 'string' ? (recent.docs[0].createdAt as string) : null

    const refused: ResendRefusal | null = resendRefusal(
      row ? { html: String(row.html ?? ''), text: String(row.text ?? '') } : null,
      lastResentAt,
      Date.now(),
    )
    if (refused || !row) return json({ error: refused?.error ?? 'That email does not exist.' }, refused?.status ?? 404)

    const result = await sendEmail({
      to: String(row.to ?? ''),
      subject: String(row.subject ?? ''),
      html: row.html ? String(row.html) : undefined,
      text: row.text ? String(row.text) : undefined,
      template: 'resend',
      resentFrom: id,
    })

    if (!result.ok) {
      const status = result.reason === 'provider-rejected' ? 502 : 409
      return json({ error: result.error || 'The email could not be sent.', reason: result.reason }, status)
    }
    return json({ ok: true, provider: result.provider ?? null })
  } catch (error) {
    console.error('admin-email-resend POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
