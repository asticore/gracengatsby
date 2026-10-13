import type { FormFieldDef, SubmissionValues } from './types'

import { appointmentFields, slotKeyFromValue } from './slots'
import { bookingsForSlot, type SlotEngine } from './slotStore'

/**
 * Double-booking rule for the submit pipeline.
 *
 * Before an entry is saved, every appointment answer is counted against the
 * bookings already stored for that form and field. If the slot is at or over
 * its capacity, the entry is refused and the visitor is told which field.
 *
 * D1 cannot lock a row across a check and an insert, so two people can pass the
 * check at the same moment. The guard therefore runs twice: once before the
 * insert, and again after it. The entry keeps its place only if its id is
 * among the first `capacity` bookings of that slot (oldest first). Otherwise
 * the entry is deleted and the visitor gets the same message. Both of two
 * racing requests can lose, which is the safe side of the race: nobody is
 * told a time is theirs when it is not.
 */

export type SlotClaim = { field: string; key: string; capacity: number }

/** The slots this submission asks for, one per visible appointment field that was answered. */
export function slotClaimsFor(fields: FormFieldDef[], values: SubmissionValues, visible: ReadonlySet<string>): SlotClaim[] {
  const claims: SlotClaim[] = []
  for (const field of appointmentFields(fields)) {
    if (!visible.has(field.name)) continue
    const key = slotKeyFromValue(values[field.name])
    if (key) claims.push({ field: field.name, key, capacity: field.capacity })
  }
  return claims
}

/** The first claimed field whose slot is already full, or null. */
export async function firstTakenSlot(engine: SlotEngine, formId: number, claims: SlotClaim[]): Promise<string | null> {
  for (const claim of claims) {
    const rows = await bookingsForSlot(engine, formId, claim.field, claim.key, claim.capacity)
    if (rows.length >= claim.capacity) return claim.field
  }
  return null
}

/** After the insert: the first claimed field where this entry is not within capacity, or null. */
export async function firstLostSlot(engine: SlotEngine, formId: number, claims: SlotClaim[], entryId: number): Promise<string | null> {
  for (const claim of claims) {
    const rows = await bookingsForSlot(engine, formId, claim.field, claim.key, claim.capacity)
    if (!rows.slice(0, claim.capacity).some((row) => row.id === entryId)) return claim.field
  }
  return null
}
