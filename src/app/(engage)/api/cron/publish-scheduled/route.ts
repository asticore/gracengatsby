import { NextResponse } from 'next/server'
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getEngine } from '@/engine'
import { runDueSchedules } from '@/features/schedule/runDue'
import { isHourlyTick } from '@/features/cron/model'
import { runJob } from '@/features/cron/runJob'

export const dynamic = 'force-dynamic'

/**
 * POST/GET: Execute scheduled publish/unpublish actions for documents whose
 * schedules have reached their time.
 *
 * Authentication: requires header `x-cron-key` equal to hex(SHA-256(ENGAGE_SECRET + ':cron'))
 * computed with constant-time comparison. Returns 401 if missing or invalid.
 *
 * If ENGAGE_SECRET is unset, returns 401.
 */
export async function POST(request: Request): Promise<Response> {
  return handleCronRequest(request)
}

export async function GET(request: Request): Promise<Response> {
  return handleCronRequest(request)
}

async function handleCronRequest(request: Request): Promise<Response> {
  const engageSecret = process.env.ENGAGE_SECRET

  // Fail if ENGAGE_SECRET is not set
  if (!engageSecret) {
    return NextResponse.json({ error: 'ENGAGE_SECRET not configured' }, { status: 401 })
  }

  const providedKey = request.headers.get('x-cron-key')
  if (!providedKey) {
    return NextResponse.json({ error: 'Missing x-cron-key header' }, { status: 401 })
  }

  try {
    // Compute the expected key: hex(SHA-256(ENGAGE_SECRET + ':cron'))
    const message = new TextEncoder().encode(`${engageSecret}:cron`)
    const hashBuffer = await crypto.subtle.digest('SHA-256', message)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const expectedKey = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

    // Constant-time comparison of the two hex strings
    if (providedKey.length !== expectedKey.length) {
      return NextResponse.json({ error: 'Invalid x-cron-key' }, { status: 401 })
    }
    let diff = 0
    for (let i = 0; i < expectedKey.length; i++) diff |= providedKey.charCodeAt(i) ^ expectedKey.charCodeAt(i)
    if (diff !== 0) {
      return NextResponse.json({ error: 'Invalid x-cron-key' }, { status: 401 })
    }

    // Key is valid - run every job. Each one is recorded in eg_cron_runs by runJob,
    // and a failing job is reported to the error log without stopping the rest.
    const engine = await getEngine()
    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1)
    const nowIso = new Date().toISOString()
    const hourly = isHourlyTick(new Date())

    const scheduled = await runJob('schedules', () => runDueSchedules(engine, db, nowIso))
    if (scheduled.status !== 'ok') {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }

    // Abandoned-cart reminders (does nothing unless switched on in Shop settings).
    await runJob('abandoned-carts', async () => {
      const { runAbandonedCartReminders } = await import('@/features/ecommerce/server/abandoned')
      await runAbandonedCartReminders(engine as never)
    })

    // "Test after publish": runs at most one due PageSpeed test per tick (does nothing unless switched on in Speed settings).
    await runJob('pagespeed', async () => {
      const { runDueTests } = await import('@/features/pagespeed/queue')
      await runDueTests(engine as never, db as never)
    })

    // Form housekeeping: webhook retries every tick, entries past their retention window hourly.
    await runJob('webhooks-retry', async () => {
      const { retryDueWebhooks } = await import('@/features/forms/maintenance')
      await retryDueWebhooks(engine as never)
    })
    await runJob(
      'prune-submissions',
      async () => {
        const { pruneSubmissions } = await import('@/features/forms/maintenance')
        await pruneSubmissions(engine as never)
      },
      { due: hourly },
    )

    // Email log: entries older than the 90-day retention are removed (checked hourly, like form entries).
    await runJob(
      'prune-email-log',
      async () => {
        const { pruneEmailLog } = await import('@/features/email/emailLogStore')
        await pruneEmailLog(engine as never)
      },
      { due: hourly },
    )

    // Gift cards whose send date has arrived are emailed to their recipients.
    await runJob('gift-cards', async () => {
      const { deliverDueGiftCards } = await import('@/features/ecommerce/server/storedValue')
      await deliverDueGiftCards(engine as never)
    })

    // Reminder emails (When emails are sent): membership renewal and event reminders, held during quiet hours.
    await runJob('scheduled-emails', async () => {
      const { runScheduledEmails } = await import('@/features/email/scheduledEmails')
      await runScheduledEmails(engine as never, new Date())
    })

    // Data clean-up from Data and system settings (old versions, trash, logs). Hourly.
    await runJob(
      'cleanup',
      async () => {
        const { runScheduledCleanup } = await import('@/features/cleanup/scheduledCleanup')
        await runScheduledCleanup(engine as never)
      },
      { due: hourly },
    )

    return NextResponse.json(scheduled.value, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('cron/publish-scheduled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
