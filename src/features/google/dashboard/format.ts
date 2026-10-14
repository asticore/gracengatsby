/**
 * Display helpers for the dashboard cards. Plain functions, safe in client components.
 */

export const formatInt = (value: number): string => Math.round(value).toLocaleString('en-GB')

export const formatPercent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`

export const formatPosition = (value: number): string => (value > 0 ? value.toFixed(1) : '-')

export const formatMoney = (value: number, currency: string): string => {
  const amount = value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${currency} ${amount}` : amount
}

/** Percentage change between two numbers. Null when the earlier value is zero (no meaningful change). */
export const percentChange = (current: number, previous: number): number | null => {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** "+12%" / "-4%" / "no change" / "" when there is nothing to compare. */
export const changeText = (current: number, previous: number): string => {
  const change = percentChange(current, previous)
  if (change === null) return ''
  if (change === 0) return 'no change'
  return `${change > 0 ? '+' : ''}${change}%`
}

/** Path part of a URL for compact tables, e.g. "/shop/hat". */
export const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}` || '/'
  } catch {
    return url
  }
}
