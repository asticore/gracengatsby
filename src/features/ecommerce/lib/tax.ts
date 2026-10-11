import { allocate, percentOf } from './money'

export type TaxClass = 'standard' | 'reduced' | 'zero'

export type TaxRate = {
  name: string
  taxClass: TaxClass
  /** ISO country code, or '' / '*' for any. */
  country?: string | null
  /** State/region code, or '' / '*' for any. */
  state?: string | null
  ratePct: number
  shippingTaxable?: boolean | null
  priority?: number | null
}

export type TaxSettings = {
  /** True when catalogue prices already include tax (the AU default). */
  pricesIncludeTax: boolean
  defaultCountry: string
  /** Store-wide fallback rate for the `standard` class (GST 10%). */
  storeRatePct: number
  enabled?: boolean
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = { pricesIncludeTax: true, defaultCountry: 'AU', storeRatePct: 10, enabled: true }

export type TaxableLine = { key: string; amountCents: number; taxClass: TaxClass }

export type TaxLineResult = { key: string; taxCents: number; netCents: number; grossCents: number }
export type TaxSummaryLine = { name: string; ratePct: number; taxCents: number; shipping?: boolean }

export type TaxResult = {
  lines: TaxLineResult[]
  shipping: { taxCents: number; netCents: number; grossCents: number }
  taxLines: TaxSummaryLine[]
  taxCents: number
  /** Tax that must be ADDED to the order total (0 when prices already include tax). */
  addedCents: number
}

const matches = (rule: string | null | undefined, value: string | null | undefined): boolean => {
  const r = (rule ?? '').trim().toUpperCase()
  if (r === '' || r === '*') return true
  return r === (value ?? '').trim().toUpperCase()
}

/**
 * The rates that apply to one tax class at an address. Rates are grouped by
 * priority; within a priority the first matching rate wins (the most specific
 * state match is tried before a country-wide one), and each priority group
 * contributes one rate - the way a state tax and a federal tax stack.
 * With no configured rate matching the store's own country, the store GST
 * rate applies to the `standard` class so a fresh shop charges GST out of the box.
 */
export function ratesFor(
  taxClass: TaxClass,
  address: { country?: string | null; state?: string | null },
  rates: TaxRate[],
  settings: TaxSettings,
  forShipping = false,
): { name: string; ratePct: number }[] {
  if (taxClass === 'zero' && !forShipping) return []
  const candidates = rates
    .filter((r) => r.taxClass === (forShipping ? 'standard' : taxClass))
    .filter((r) => matches(r.country, address.country) && matches(r.state, address.state))
    .filter((r) => !forShipping || r.shippingTaxable !== false)
    .sort((a, b) => {
      const pa = a.priority ?? 1
      const pb = b.priority ?? 1
      if (pa !== pb) return pa - pb
      const specA = (a.state ? 2 : 0) + (a.country && a.country !== '*' ? 1 : 0)
      const specB = (b.state ? 2 : 0) + (b.country && b.country !== '*' ? 1 : 0)
      return specB - specA
    })
  const picked: { name: string; ratePct: number }[] = []
  const seen = new Set<number>()
  for (const r of candidates) {
    const p = r.priority ?? 1
    if (seen.has(p)) continue
    seen.add(p)
    picked.push({ name: r.name, ratePct: r.ratePct })
  }
  if (picked.length > 0) return picked
  const inStoreCountry = (address.country ?? '').trim().toUpperCase() === settings.defaultCountry.trim().toUpperCase() || !address.country
  if (inStoreCountry && (taxClass === 'standard' || forShipping) && settings.storeRatePct > 0) {
    return [{ name: 'GST', ratePct: settings.storeRatePct }]
  }
  return []
}

/** Splits `tax` across the rates in proportion to rate size, exactly. */
function splitTax(tax: number, rates: { ratePct: number }[]): number[] {
  return allocate(tax, rates.map((r) => r.ratePct))
}

/**
 * Pure tax calculation in integer cents.
 *
 * - Inclusive prices: tax is the part of the gross already inside the price,
 *   `gross * r / (100 + r)`, rounded half-up per line. The order total does not change.
 * - Exclusive prices: tax is `net * r / 100` per line and is added on top.
 * `lines[].amountCents` must already have discounts taken off.
 */
export function calcTax(args: {
  lines: TaxableLine[]
  shippingCents?: number
  shippingTaxable?: boolean
  rates: TaxRate[]
  settings: TaxSettings
  address: { country?: string | null; state?: string | null }
}): TaxResult {
  const { lines, rates, settings, address } = args
  const inclusive = settings.pricesIncludeTax
  const summary = new Map<string, TaxSummaryLine>()
  const bump = (name: string, ratePct: number, taxCents: number, shipping = false) => {
    if (taxCents === 0) return
    const key = `${shipping ? 's:' : ''}${name}|${ratePct}`
    const existing = summary.get(key)
    if (existing) existing.taxCents += taxCents
    else summary.set(key, { name, ratePct, taxCents, ...(shipping ? { shipping: true } : {}) })
  }

  const compute = (amount: number, applicable: { name: string; ratePct: number }[], shipping: boolean) => {
    const totalRate = applicable.reduce((s, r) => s + r.ratePct, 0)
    if (amount <= 0 || totalRate <= 0) return { tax: 0, net: amount, gross: amount }
    const tax = inclusive ? Math.round((amount * Math.round(totalRate * 100)) / (10000 + Math.round(totalRate * 100))) : percentOf(amount, totalRate)
    const parts = applicable.length === 1 ? [tax] : splitTax(tax, applicable)
    applicable.forEach((r, i) => bump(r.name, r.ratePct, parts[i], shipping))
    return inclusive ? { tax, net: amount - tax, gross: amount } : { tax, net: amount, gross: amount + tax }
  }

  const enabled = settings.enabled !== false
  const lineResults: TaxLineResult[] = lines.map((line) => {
    const applicable = enabled ? ratesFor(line.taxClass, address, rates, settings) : []
    const r = compute(line.amountCents, applicable, false)
    return { key: line.key, taxCents: r.tax, netCents: r.net, grossCents: r.gross }
  })

  const shippingAmount = args.shippingCents ?? 0
  const shipApplicable = enabled && args.shippingTaxable !== false ? ratesFor('standard', address, rates, settings, true) : []
  const ship = compute(shippingAmount, shipApplicable, true)

  const taxCents = lineResults.reduce((s, l) => s + l.taxCents, 0) + ship.tax
  return {
    lines: lineResults,
    shipping: { taxCents: ship.tax, netCents: ship.net, grossCents: ship.gross },
    taxLines: [...summary.values()],
    taxCents,
    addedCents: inclusive ? 0 : taxCents,
  }
}
