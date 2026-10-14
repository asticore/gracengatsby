import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { adminRequestRefusal } from '@/features/forms/origin'
import { readEmailTestingSettings, type EmailTestingSettings } from '@/features/email/connectionRead'
import { senderDomain } from '@/features/email/dnsCheck'
import { checkSenderDomain } from '@/features/email/dnsLookup'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { batchKeys, batchRefusal, chooseRecipient, isKnownKey } from '@/features/email/testRun'
import { sendTemplateTest, sendTemplateTests } from '@/features/email/testRunSend'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin-email-test-run  { action, key?, to? }
 *
 * The actions behind the Email testing screen. Admins only, and JSON only with
 * the same origin check the resend route uses.
 *
 *   send-one  - send one template's test copy            { key, to? }
 *   send-all  - send every template's test copy (batch)  { to? }
 *   dns       - check SPF, DMARC and DKIM for the From domain
 *
 * A batch may start once every BATCH_INTERVAL_MS per admin. The memory is per
 * server instance, so it is a guard against double clicks, not a hard limit.
 * Recipients are limited by chooseRecipient in testRun.ts.
 */

type FindEngine = { findGlobal: (args: { slug: string; depth: number }) => Promise<unknown> }

type RunBody = { action?: unknown; key?: unknown; to?: unknown }

const lastBatchByAdmin = new Map<string, number>()

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return json({ error: refusal }, 403)

    const context = await getAdminContext()
    if (!context.user) return json({ error: 'Unauthorised' }, 401)
    if (!context.isAdmin) return json({ error: 'Forbidden' }, 403)

    const user = context.user as unknown as { id?: unknown; email?: unknown }
    const adminEmail = typeof user.email === 'string' ? user.email : null

    const body = (await request.json().catch((): null => null)) as RunBody | null
    const settings: EmailTestingSettings = await readEmailTestingSettings(context.engine as unknown as FindEngine)
    const known = Object.keys(EMAIL_TEMPLATE_DEFAULTS)

    if (body?.action === 'dns') {
      const domain = senderDomain(settings.fromEmail)
      if (!domain) return json({ error: 'Set a valid From address under Sender and testing first.' }, 400)
      const defaultKey = settings.summary.providers.find((provider) => provider.isDefault)?.key ?? null
      const report = await checkSenderDomain(domain, defaultKey)
      return json({ report })
    }

    if (body?.action === 'send-one') {
      if (!isKnownKey(body.key, known)) return json({ error: 'Choose an email to test.' }, 400)
      const target = chooseRecipient(body.to, adminEmail, settings.testRecipient)
      if ('error' in target) return json({ error: target.error }, 400)
      const row = await sendTemplateTest(body.key, target.to)
      return json({ row, to: target.to })
    }

    if (body?.action === 'send-all') {
      const adminKey = String(user.id ?? adminEmail ?? 'admin')
      const now = Date.now()
      const refused = batchRefusal(lastBatchByAdmin.get(adminKey), now)
      if (refused) return json({ error: refused.error }, refused.status)

      const target = chooseRecipient(body.to, adminEmail, settings.testRecipient)
      if ('error' in target) return json({ error: target.error }, 400)

      if (lastBatchByAdmin.size > 500) lastBatchByAdmin.clear()
      lastBatchByAdmin.set(adminKey, now)
      const rows = await sendTemplateTests(batchKeys(known), target.to)
      return json({ rows, to: target.to })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    console.error('admin-email-test-run POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
