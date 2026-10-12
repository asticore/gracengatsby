import type { Cell, FilterRule } from './types'
import type { FieldKind } from './catalogue'

/**
 * Filtering and sorting on plain values, in memory. A view's filter is data (a field key, one of a
 * fixed list of operators and a text value); it is never concatenated into a query, so there is no
 * query language for a crafted rule to escape into. Rules naming a field that is not allowed are
 * removed before this runs (see resolve.ts).
 */

const asText = (cell: Cell): string => (cell === null || cell === undefined ? '' : String(cell))

const toNumber = (cell: Cell): number | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  if (typeof cell !== 'string') return null
  const cleaned = cell.replace(/[\s,$%]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

const toTime = (cell: Cell): number | null => {
  if (typeof cell !== 'string' || cell === '') return null
  const time = Date.parse(cell)
  return Number.isNaN(time) ? null : time
}

/** Compares two cells of one kind: numbers numerically, dates by time, everything else as case-insensitive text. */
export function compareCells(a: Cell, b: Cell, kind: FieldKind): number {
  const aEmpty = a === null || a === ''
  const bEmpty = b === null || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  if (kind === 'number') {
    const x = toNumber(a)
    const y = toNumber(b)
    if (x !== null && y !== null) return x - y
  }
  if (kind === 'date') {
    const x = toTime(a)
    const y = toTime(b)
    if (x !== null && y !== null) return x - y
  }
  return asText(a).localeCompare(asText(b), undefined, { sensitivity: 'base', numeric: true })
}

/** True when the cell passes the rule. A rule whose number or date cannot be read never matches (it does not throw). */
export function matchesRule(cell: Cell, rule: FilterRule, kind: FieldKind): boolean {
  const empty = cell === null || cell === undefined || cell === ''
  switch (rule.operator) {
    case 'isEmpty':
      return empty
    case 'notEmpty':
      return !empty
    case 'equals':
      return kind === 'number' && toNumber(cell) !== null && toNumber(rule.value) !== null ? toNumber(cell) === toNumber(rule.value) : asText(cell).toLowerCase() === rule.value.trim().toLowerCase()
    case 'notEquals':
      return !matchesRule(cell, { ...rule, operator: 'equals' }, kind)
    case 'contains':
      return rule.value !== '' && asText(cell).toLowerCase().includes(rule.value.toLowerCase())
    case 'notContains':
      return rule.value === '' || !asText(cell).toLowerCase().includes(rule.value.toLowerCase())
    case 'in': {
      const wanted = rule.value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)
      return wanted.includes(asText(cell).trim().toLowerCase())
    }
    case 'greater':
    case 'greaterOrEqual':
    case 'less':
    case 'lessOrEqual': {
      if (empty) return false
      let x: number | null
      let y: number | null
      if (kind === 'date') {
        x = toTime(cell)
        y = toTime(rule.value)
      } else {
        x = toNumber(cell)
        y = toNumber(rule.value)
      }
      if (x === null || y === null) return false
      if (rule.operator === 'greater') return x > y
      if (rule.operator === 'greaterOrEqual') return x >= y
      if (rule.operator === 'less') return x < y
      return x <= y
    }
    default:
      return false
  }
}
