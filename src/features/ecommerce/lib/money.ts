/**
 * Integer-cent money helpers. Every amount the shop computes is held as whole
 * cents so nothing ever accumulates floating-point error. Product and settings
 * fields are stored in whole dollars (see PriceInput); `toCents` is the one
 * place that crosses that boundary.
 */

/** Whole dollars (29.99) to integer cents (2999), rounding half-up. */
export function toCents(dollars: unknown): number {
  const n = typeof dollars === 'number' ? dollars : Number(dollars)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100)
}

/** `cents * pct / 100`, rounded half-up to a whole cent. `pct` may have up to 2 decimals (e.g. 8.25). */
export function percentOf(cents: number, pct: number): number {
  const basisPoints = Math.round(pct * 100)
  return Math.round((cents * basisPoints) / 10000)
}

/**
 * Splits `total` across `weights` so the parts add up to exactly `total`
 * (largest-remainder). Used to spread a cart-level discount over lines.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const floors = raw.map((r) => Math.floor(r))
  let remainder = total - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (remainder <= 0) break
    floors[i] += 1
    remainder -= 1
  }
  return floors
}

export function formatCents(cents: number | null | undefined, currency = 'AUD'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '-'
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}
