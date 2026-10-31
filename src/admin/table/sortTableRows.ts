/**
 * Pure sort rules for the shared admin table (`SortableTable`). Kept free of React so the
 * order can be tested directly. Values are plain strings, numbers or booleans; a callers
 * converts dates to numbers (ms) before passing them, so rows stay serialisable across the
 * server/client boundary.
 */

export type SortDirection = 'asc' | 'desc'
export type SortValue = string | number | boolean | null | undefined
export type TableSort = { key: string; direction: SortDirection } | null

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Empty values always sort last, whichever direction is chosen. */
function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || value === ''
}

/** Compare two cell values ascending: numbers and booleans by value, strings naturally (2 before 10). */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (isEmpty(a) || isEmpty(b)) {
    if (isEmpty(a) && isEmpty(b)) return 0
    return isEmpty(a) ? 1 : -1
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b)
  return collator.compare(String(a), String(b))
}

/** Returns a new array in sort order. Stable, so equal values keep their server order. */
export function sortTableRows<R extends { sortValues: Record<string, SortValue> }>(rows: readonly R[], sort: TableSort): R[] {
  if (!sort) return [...rows]
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((x, y) => {
    const a = x.sortValues[sort.key]
    const b = y.sortValues[sort.key]
    if (isEmpty(a) || isEmpty(b)) return compareSortValues(a, b)
    return sign * compareSortValues(a, b)
  })
}

/** Click order for one column: unsorted, then ascending, then descending, then ascending again. */
export function nextTableSort(current: TableSort, key: string): TableSort {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

/** The value for an `aria-sort` attribute on one header. */
export function ariaSortFor(current: TableSort, key: string): 'ascending' | 'descending' | 'none' {
  if (!current || current.key !== key) return 'none'
  return current.direction === 'asc' ? 'ascending' : 'descending'
}
