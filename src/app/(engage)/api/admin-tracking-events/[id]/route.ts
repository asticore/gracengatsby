import { NextResponse } from 'next/server'

import { deleteTrackingEvent, findTrackingEventByID, updateTrackingEvent } from '@/cms/db/collections/tracking'
import { readTrackingEventBody, TRACKING_EVENT_FIELDS } from '@/features/tracking/apiBody'
import { trackingApiGate } from '@/features/tracking/apiGate'
import type { TrackingEventDef } from '@/features/tracking/events'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const idOf = async (params: Params['params']): Promise<number | null> => {
  const id = Number((await params).id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Edits one tracking event. Fields the body leaves out keep their stored value. Admin only. */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const denied = await trackingApiGate('update')
  if (denied) return denied
  const id = await idOf(params)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const existing = await findTrackingEventByID(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 })

  const base = Object.fromEntries(TRACKING_EVENT_FIELDS.map((key) => [key, existing[key]])) as Partial<TrackingEventDef>
  const { def, errors } = readTrackingEventBody(body, base)
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 422 })

  const row: Record<string, unknown> = {}
  for (const key of TRACKING_EVENT_FIELDS) row[key] = def[key] ?? null
  await updateTrackingEvent(id, row)
  return NextResponse.json({ id })
}

/** Deletes one tracking event. Admin only. */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const denied = await trackingApiGate('delete')
  if (denied) return denied
  const id = await idOf(params)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const existing = await findTrackingEventByID(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteTrackingEvent(id)
  return NextResponse.json({ id, deleted: true })
}
