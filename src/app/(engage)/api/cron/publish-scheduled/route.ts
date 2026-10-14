import { NextResponse } from 'next/server'
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getEngine } from '@/engine'
import { runDueSchedules } from '@/features/schedule/runDue'

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

    // Key is valid - run due schedules
    const engine = await getEngine()
    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1)
    const nowIso = new Date().toISOString()
    const result = await runDueSchedules(engine, db, nowIso)

    // Abandoned-cart reminders (does nothing unless switched on in Shop settings).
    try {
      const { runAbandonedCartReminders } = await import('@/features/ecommerce/server/abandoned')
      await runAbandonedCartReminders(engine as never)
    } catch (error) {
      console.error('cron abandoned-cart error:', error)
    }

    // "Test after publish": runs at most one due PageSpeed test per tick (does nothing unless switched on in Speed settings).
    try {
      const { runDueTests } = await import('@/features/pagespeed/queue')
      await runDueTests(engine as never, db as never)
    } catch (error) {
      console.error('cron pagespeed error:', error)
    }
    // Form housekeeping: webhook retries and entries past their retention window.
    try {
      const { pruneSubmissions, retryDueWebhooks } = await import('@/features/forms/maintenance')
      await retryDueWebhooks(engine as never)
      // Retention is checked hourly: the 5-minute cron would only repeat an empty query.
      if (new Date().getUTCMinutes() < 5) await pruneSubmissions(engine as never)
    } catch (error) {
      console.error('cron form-maintenance error:', error)
    }
    // Email log: entries older than the 90-day retention are removed (checked hourly, like form entries).
    try {
      const { pruneEmailLog } = await import('@/features/email/emailLogStore')
      if (new Date().getUTCMinutes() < 5) await pruneEmailLog(engine as never)
    } catch (error) {
      console.error('cron email-log prune error:', error)
    }
    // Gift cards whose send date has arrived are emailed to their recipients.
    try {
      const { deliverDueGiftCards } = await import('@/features/ecommerce/server/storedValue')
      await deliverDueGiftCards(engine as never)
    } catch (error) {
      console.error('cron gift-card delivery error:', error)
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('cron/publish-scheduled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
