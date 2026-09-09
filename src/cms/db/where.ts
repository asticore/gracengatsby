import type { Sort, Where } from '@/engine'

import { and, asc, desc, eq, gt, gte, isNotNull, isNull, like, lt, lte, ne, notInArray, notLike, inArray, or, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/**
 * Translates a Payload `Where` clause into a drizzle SQL condition, for one
 * flat table (no relationship/joined-field paths - those need the child-table
 * joins the generic engine builds; out of scope until a collection that
 * actually has them is being cloned).
 *
 * Covers the operators this app's own queries actually use: equals,
 * not_equals, in, not_in, exists, contains/like, not_like, and the four
 * comparison operators, combined through and/or. Anything else throws
 * rather than silently matching the wrong rows.
 */
export function buildWhere(columns: Record<string, SQLiteColumn>, where: Where | undefined): SQL | undefined {
  if (!where) return undefined

  const parts: SQL[] = []

  for (const [key, value] of Object.entries(where)) {
    if (key === 'and' && Array.isArray(value)) {
      const clause = and(...(value as Where[]).map((w) => buildWhere(columns, w)).filter((c): c is SQL => !!c))
      if (clause) parts.push(clause)
      continue
    }
    if (key === 'or' && Array.isArray(value)) {
      const clause = or(...(value as Where[]).map((w) => buildWhere(columns, w)).filter((c): c is SQL => !!c))
      if (clause) parts.push(clause)
      continue
    }

    const column = columns[key]
    if (!column) {
      throw new Error(`buildWhere: no column mapped for field "${key}" - this collection's field-to-column map is incomplete.`)
    }

    const field = value as Record<string, unknown>
    for (const [operator, operand] of Object.entries(field)) {
      switch (operator) {
        case 'equals':
          parts.push(eq(column, operand))
          break
        case 'not_equals':
          parts.push(ne(column, operand))
          break
        case 'in':
          parts.push(inArray(column, operand as unknown[]))
          break
        case 'not_in':
          parts.push(notInArray(column, operand as unknown[]))
          break
        case 'exists':
          parts.push(operand ? isNotNull(column) : isNull(column))
          break
        case 'contains':
        case 'like':
          parts.push(like(column, `%${String(operand)}%`))
          break
        case 'not_like':
          parts.push(notLike(column, `%${String(operand)}%`))
          break
        case 'greater_than':
          parts.push(gt(column, operand))
          break
        case 'greater_than_equal':
          parts.push(gte(column, operand))
          break
        case 'less_than':
          parts.push(lt(column, operand))
          break
        case 'less_than_equal':
          parts.push(lte(column, operand))
          break
        default:
          throw new Error(`buildWhere: operator "${operator}" is not implemented yet.`)
      }
    }
  }

  return parts.length ? and(...parts) : undefined
}

/**
 * Translates a Payload `Sort` (a field name, optionally "-"-prefixed for
 * descending, or an array of them) into drizzle `orderBy` terms - the same
 * per-item convention @payloadcms/drizzle's own real buildOrderBy uses
 * (confirmed by reading it directly, not guessed): a bare field name sorts
 * ascending, a "-" prefix descending, and an unresolvable field (a dotted/
 * group path, or a field this flat-table builder has no column for) is
 * silently skipped rather than thrown on - matching that real adapter's own
 * try/catch around each sort item (it wraps path resolution and swallows a
 * failure to resolve one), since a cutover collection may receive a sort
 * string aimed at a field shape this layer doesn't resolve yet without that
 * being a hard error.
 *
 * Always appends a final `-id` term when the caller's sort doesn't already
 * include one, so paginated results stay stable page to page - the same
 * guarantee Payload's own adapter gives (it prefers `-createdAt` as its
 * fallback; every table this layer generates always has a plain integer
 * `id` column too, and `id` and insertion order increase together, so `-id`
 * alone is equally stable here).
 */
export function applySort(columns: Record<string, SQLiteColumn>, sort: Sort | undefined): SQL[] {
  const items = sort ? (Array.isArray(sort) ? sort : [sort]) : []
  const terms: SQL[] = []
  let sortsById = false

  for (const item of items) {
    const isDescending = item.startsWith('-')
    const field = isDescending ? item.slice(1) : item
    if (field === 'id') sortsById = true
    const column = columns[field]
    if (!column) continue
    terms.push(isDescending ? desc(column) : asc(column))
  }

  if (!sortsById && columns.id) {
    terms.push(desc(columns.id))
  }

  return terms
}
