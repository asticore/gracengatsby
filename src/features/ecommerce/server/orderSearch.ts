import { rawD1 } from './db'

/**
 * Extra search-box matches for the orders list. The list's generic search covers the order number
 * and email; the customer's name lives inside the shipping address group, so it is matched here
 * with one LIKE over the name columns and returned as an id list for the list query to OR in.
 * Matches are capped at 500 orders; with no matching name it returns no branches.
 */
export async function orderNameSearchBranches(q: string): Promise<Record<string, unknown>[]> {
  const term = q.trim().slice(0, 100)
  if (!term) return []
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const d1 = await rawD1()
  const rows = await d1
    .prepare(
      `SELECT id FROM eg_orders WHERE (COALESCE(shipping_address_first_name, '') || ' ' || COALESCE(shipping_address_last_name, '')) LIKE ?1 ESCAPE '\\' ORDER BY id DESC LIMIT 500`,
    )
    .bind(like)
    .all<{ id: number }>()
  const ids = (rows.results ?? []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n))
  return ids.length > 0 ? [{ id: { in: ids } }] : []
}
