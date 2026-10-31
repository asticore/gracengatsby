import type { D1Like } from '@/features/apiKeys'
import { valuesMentionEmail, stripSecrets } from './core'

/**
 * Reads and writes a customer's records across the site. Shared by the export and the erasure, so
 * both find exactly the same rows. Every engine call runs with `overrideAccess: true` and an explicit
 * ownership filter (the customer id or the email), never a bare list.
 */

export type EngineLike = {
  find(args: Record<string, unknown>): Promise<{ docs: Record<string, unknown>[] }>
  update(args: Record<string, unknown>): Promise<unknown>
  delete(args: Record<string, unknown>): Promise<unknown>
}

export const asEngine = (engine: unknown): EngineLike => engine as EngineLike

const LIMIT = 1000

/** Addresses, orders, bookings and form entries that belong to this customer. */
export async function customerRecords(engine: EngineLike, d1: D1Like, userId: number, email: string) {
  const addresses = await engine.find({ collection: 'addresses', where: { customer: { equals: userId } }, limit: LIMIT, depth: 0, overrideAccess: true })
  const orders = await engine.find({
    collection: 'orders',
    where: { or: [{ customer: { equals: userId } }, { customerEmail: { equals: email } }] },
    limit: LIMIT,
    depth: 0,
    overrideAccess: true,
  })
  const bookings = await engine.find({ collection: 'event-rsvps', where: { email: { equals: email } }, limit: LIMIT, depth: 0, overrideAccess: true })
  const submissions = await matchingSubmissions(d1, email)
  return { addresses: addresses.docs, orders: orders.docs, bookings: bookings.docs, submissions }
}

export type MatchedSubmission = { id: number; form: string; submittedAt: string | null; values: unknown }

/**
 * Form entries whose values hold this email. A SQL LIKE narrows the rows; the exact comparison
 * decides, so a longer address that contains this one is never matched.
 */
export async function matchingSubmissions(d1: D1Like, email: string): Promise<MatchedSubmission[]> {
  const wanted = email.trim()
  if (!wanted) return []
  const pattern = `%${wanted.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const rows = await d1
    .prepare('SELECT id, form_id, "values", submitted_at FROM eg_form_submissions WHERE "values" LIKE ? ESCAPE ? LIMIT ?')
    .bind(pattern, '\\', LIMIT)
    .all<{ id: number; form_id: number; values: string; submitted_at: string | null }>()
  const out: MatchedSubmission[] = []
  for (const row of rows.results ?? []) {
    let values: unknown = null
    try {
      values = JSON.parse(row.values) as unknown
    } catch {
      continue
    }
    if (!valuesMentionEmail(values, wanted)) continue
    out.push({ id: Number(row.id), form: String(row.form_id), submittedAt: row.submitted_at ?? null, values: stripSecrets(values) })
  }
  return out
}
