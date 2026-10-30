import { NextResponse } from 'next/server'

import { createTrackingEvent, findTrackingEventsPaginated } from '@/cms/db/collections/tracking'
import { readTrackingEventBody, trackingEventSummary } from '@/features/tracking/apiBody'
import { trackingApiGate } from '@/features/tracking/apiGate'

export const dynamic = 'force-dynamic'

/** Every tracking event, for the tag editor's list of what is already tagged. Admin only. */
export async function GET(): Promise<NextResponse> {
  const denied = await trackingApiGate('read')
  if (denied) return denied
  const result = await findTrackingEventsPaginated({ limit: 1000, pagination: false })
  const docs = (result?.docs ?? []) as Record<string, unknown>[]
  return NextResponse.json({ events: docs.map(trackingEventSummary) })
}

/**
 * Creates one tracking event from the tag editor or the picker. Admin only, checked against the real session (not a
 * cookie alone). Only the known fields are taken, and the same validator as the collection runs before the row is written.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = await trackingApiGate('create')
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 })

  const { def, errors } = readTrackingEventBody(body)
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 422 })

  const row: Record<string, unknown> = {}
  for (const key of ['name', 'platformEvent', 'triggerType', 'selector', 'selectorText', 'urlMatchMode', 'urlMatch', 'domain', 'scrollDepth', 'timeSeconds', 'value', 'currency', 'contentName', 'enabled'] as const) {
    row[key] = def[key] ?? null
  }
  const created = await createTrackingEvent(row)
  return NextResponse.json({ id: created.id }, { status: 201 })
}
