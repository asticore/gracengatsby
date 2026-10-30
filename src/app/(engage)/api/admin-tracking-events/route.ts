import { NextResponse } from 'next/server'

import { createTrackingEvent } from '@/cms/db/collections/tracking'
import { getAdminContext } from '@/admin/auth'
import { STANDARD_EVENTS, TRIGGER_TYPES, URL_MATCH_MODES, validateTrackingEvent, type TrackingEventDef } from '@/features/tracking/events'

export const dynamic = 'force-dynamic'

const FIELDS = [
  'name',
  'platformEvent',
  'triggerType',
  'selector',
  'selectorText',
  'urlMatchMode',
  'urlMatch',
  'domain',
  'scrollDepth',
  'timeSeconds',
  'value',
  'currency',
  'contentName',
  'enabled',
] as const

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * Creates one tracking event from the visual picker. Admin only, checked against the real session (not a cookie
 * alone). Only the known fields are taken, and the same validator as the collection runs before the row is written.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAdminContext().catch((): null => null)
  if (!context?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!context.isAdmin && !context.can('tracking', 'create')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 })
  }

  const def: TrackingEventDef = {
    name: text(body.name) ?? '',
    platformEvent: (text(body.platformEvent) ?? 'Custom') as TrackingEventDef['platformEvent'],
    triggerType: (text(body.triggerType) ?? 'click') as TrackingEventDef['triggerType'],
    selector: text(body.selector),
    selectorText: text(body.selectorText),
    urlMatchMode: (text(body.urlMatchMode) ?? 'any') as TrackingEventDef['urlMatchMode'],
    urlMatch: text(body.urlMatch),
    domain: text(body.domain),
    scrollDepth: typeof body.scrollDepth === 'number' ? body.scrollDepth : null,
    timeSeconds: typeof body.timeSeconds === 'number' ? body.timeSeconds : null,
    value: typeof body.value === 'number' ? body.value : null,
    currency: text(body.currency),
    contentName: text(body.contentName),
    enabled: body.enabled !== false,
  }
  const errors = validateTrackingEvent(def)
  if (!STANDARD_EVENTS.includes(def.platformEvent) || !TRIGGER_TYPES.includes(def.triggerType) || !URL_MATCH_MODES.includes(def.urlMatchMode as never)) {
    errors.push('Unknown standard event, trigger or URL match.')
  }
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 422 })

  const row: Record<string, unknown> = {}
  for (const key of FIELDS) row[key] = def[key as keyof TrackingEventDef] ?? null
  const created = await createTrackingEvent(row)
  return NextResponse.json({ id: created.id }, { status: 201 })
}
