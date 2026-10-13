import { clientKey, hit } from '@/features/security'

import { isPublished, withResolvedFields } from './layout'
import { formsEnabled } from './settings'
import { loadPublishedForm, type LookupEngine } from './server'
import { appointmentFields, normaliseSlotDate, takenTimesOn } from './slots'
import { bookedKeysOnDate, type SlotEngine } from './slotStore'

/**
 * GET /api/form-slots?form=<id or key>&field=<name>&date=YYYY-MM-DD
 *
 * Tells the form which start times on one day are already full, so the
 * visitor does not pick one only to be refused on send. The answer is the bare
 * list of times - no names, no emails, no counts of anything else. The server
 * rule in slotGuard.ts is still the one that decides; this is only a hint.
 *
 * Refuses anything that is not a published form with a real appointment field
 * of that name. Rate limited per client and never cached.
 */

export const SLOT_RATE_LIMIT_PER_MINUTE = 60

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

export async function handleSlotsRequest(request: Request, engine: LookupEngine & SlotEngine): Promise<Response> {
  const decision = hit(`form-slots:${clientKey(request)}`, SLOT_RATE_LIMIT_PER_MINUTE)
  if (decision.limited) {
    return json({ ok: false, message: 'Too many requests. Please wait a moment and try again.' }, 429, {
      'Retry-After': String(decision.retryAfterSeconds),
    })
  }

  const params = new URL(request.url).searchParams
  const fieldName = (params.get('field') || '').trim()
  const date = normaliseSlotDate(params.get('date'))
  if (!date || !fieldName || fieldName.length > 64) {
    return json({ ok: false, message: 'Please give a form, a field and a day.' }, 400)
  }

  if (!(await formsEnabled(engine as never))) return json({ ok: false, message: 'Not found' }, 404)

  const loaded = await loadPublishedForm(engine, params.get('form') || '')
  if (!loaded || !isPublished(loaded)) return json({ ok: false, message: 'Not found' }, 404)

  const form = withResolvedFields(loaded)
  const field = appointmentFields(form.fields || []).find((candidate) => candidate.name === fieldName)
  if (!field) return json({ ok: false, message: 'Not found' }, 404)

  const booked = await bookedKeysOnDate(engine, Number(form.id), fieldName, date)
  return json({ ok: true, date, taken: takenTimesOn(booked, date, field.capacity) }, 200)
}
