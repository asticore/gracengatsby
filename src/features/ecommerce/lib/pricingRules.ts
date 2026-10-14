/**
 * Dynamic pricing rules: shop-wide discounts by quantity, customer role, cart subtotal or category, with
 * dates and a priority. They are applied on the server before coupons (see server/pricing.ts). Pure: no
 * I/O, so the storefront note and the server share one set of rules. Money is integer cents.
 *
 * How rules combine, in plain terms:
 * - Rules are checked in priority order (lower number first; ties keep the order they were entered).
 * - A rule that matches an item takes its discount off that item's price left at that point, so
 *   ordinary rules stack.
 * - A rule marked "stop after this rule" ends the checking for that item. Use it for quantity tiers: give
 *   the biggest tier the lowest priority number and tick the box, and only one tier applies to an item.
 */

import { percentOf, toCents } from './money'

export type RuleDiscountType = 'percent' | 'fixed'
export type RuleCondition = 'quantity' | 'role' | 'subtotal' | 'category'

/** One rule as the server uses it. Money is cents; dates are ISO text or null. */
export type PricingRule = {
  id: string
  name: string
  enabled: boolean
  discountType: RuleDiscountType
  /** percent: 0-100. fixed: dollars off each item. */
  amount: number
  appliesWhen: RuleCondition
  /** quantity: the item must be bought this many or more at once. */
  minQuantity: number
  /** role: a customer whose role list includes this name. */
  customerRole: string
  /** subtotal: the cart must reach this many cents. */
  minSubtotalCents: number
  /** category: items in this category (slug). */
  category: string
  startsAt: string | null
  endsAt: string | null
  priority: number
  exclusive: boolean
  showOnProduct: boolean
}

/** Raw rows as stored on the shop-extra-settings global (prices in whole dollars). */
export type PricingRuleRow = Partial<Record<keyof Omit<PricingRule, 'minSubtotalCents'> | 'minSubtotal', unknown>>

export const MAX_RULES = 50

const CONDITIONS: RuleCondition[] = ['quantity', 'role', 'subtotal', 'category']

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Cleans the stored rows. A row with no name or an unusable amount is dropped rather than guessed at. */
export function normalisePricingRules(raw: unknown): PricingRule[] {
  if (!Array.isArray(raw)) return []
  const out: PricingRule[] = []
  for (const [index, entry] of raw.entries()) {
    if (out.length >= MAX_RULES) break
    if (!entry || typeof entry !== 'object') continue
    const row = entry as PricingRuleRow
    const name = text(row.name, 100)
    const amount = typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : NaN
    if (!name || !(amount > 0)) continue
    const discountType: RuleDiscountType = row.discountType === 'fixed' ? 'fixed' : 'percent'
    if (discountType === 'percent' && amount > 100) continue
    const appliesWhen = (CONDITIONS as unknown[]).includes(row.appliesWhen) ? (row.appliesWhen as RuleCondition) : 'quantity'
    const minQty = typeof row.minQuantity === 'number' && Number.isFinite(row.minQuantity) ? Math.max(1, Math.floor(row.minQuantity)) : 1
    const minSubtotal = typeof row.minSubtotal === 'number' && Number.isFinite(row.minSubtotal) && row.minSubtotal > 0 ? row.minSubtotal : 0
    const priority = typeof row.priority === 'number' && Number.isFinite(row.priority) ? row.priority : 10
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `rule-${index}`,
      name,
      enabled: row.enabled !== false,
      discountType,
      amount,
      appliesWhen,
      minQuantity: minQty,
      customerRole: text(row.customerRole, 60).toLowerCase(),
      minSubtotalCents: toCents(minSubtotal),
      category: text(row.category, 80).toLowerCase(),
      startsAt: isoOrNull(row.startsAt),
      endsAt: isoOrNull(row.endsAt),
      priority,
      exclusive: row.exclusive === true,
      showOnProduct: row.showOnProduct === true,
    })
  }
  // Stable sort: equal priorities keep the order they were entered.
  return out
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => a.rule.priority - b.rule.priority || a.i - b.i)
    .map(({ rule }) => rule)
}

/** Enabled and inside its date window (either end may be open). */
export function ruleIsLive(rule: PricingRule, now: Date = new Date()): boolean {
  if (!rule.enabled) return false
  const t = now.getTime()
  if (rule.startsAt && new Date(rule.startsAt).getTime() > t) return false
  if (rule.endsAt && new Date(rule.endsAt).getTime() < t) return false
  return true
}

export type RuleLine = {
  key: string
  categories: string[]
  quantity: number
  unitCents: number
  /** Gift cards are never discounted. */
  isGiftCard?: boolean
}

export type RuleContext = {
  lines: RuleLine[]
  /** Cart subtotal before any rule, in cents. */
  subtotalCents: number
  /** Names of the signed-in customer's roles (empty for a guest). */
  customerRoles?: string[]
  now?: Date
}

export type AppliedRule = { id: string; name: string; cents: number }

export type RuleResult = {
  /** Discount per line key, in cents. Only lines that were discounted appear. */
  lineDiscounts: Record<string, number>
  /** Total each rule took off, for the order record. */
  applied: AppliedRule[]
  totalCents: number
}

function matches(rule: PricingRule, line: RuleLine, ctx: RuleContext): boolean {
  switch (rule.appliesWhen) {
    case 'quantity':
      return line.quantity >= rule.minQuantity
    case 'role': {
      const wanted = rule.customerRole.trim().toLowerCase()
      return wanted !== '' && (ctx.customerRoles ?? []).some((r) => r.trim().toLowerCase() === wanted)
    }
    case 'subtotal':
      return ctx.subtotalCents >= rule.minSubtotalCents
    case 'category': {
      const wanted = rule.category.trim().toLowerCase()
      return wanted !== '' && line.categories.some((c) => c.trim().toLowerCase() === wanted)
    }
    default:
      return false
  }
}

/**
 * Works out every rule discount for the cart, in cents, without going below zero on any line. Pure:
 * the caller passes the lines (already priced), the subtotal and the customer's roles.
 */
export function applyPricingRules(rules: PricingRule[], ctx: RuleContext): RuleResult {
  const now = ctx.now ?? new Date()
  const live = rules.filter((rule) => ruleIsLive(rule, now))
  const lineDiscounts: Record<string, number> = {}
  const stopped = new Set<string>()
  const totals = new Map<string, number>()
  for (const line of ctx.lines) {
    if (line.isGiftCard || !Number.isInteger(line.quantity) || line.quantity <= 0) continue
    const base = line.unitCents * line.quantity
    let remaining = base
    for (const rule of live) {
      if (remaining <= 0) break
      if (stopped.has(line.key)) break
      if (!matches(rule, line, ctx)) continue
      const off =
        rule.discountType === 'percent' ? percentOf(remaining, Math.min(100, rule.amount)) : Math.min(remaining, toCents(rule.amount) * line.quantity)
      if (off <= 0) continue
      remaining -= off
      lineDiscounts[line.key] = (lineDiscounts[line.key] ?? 0) + off
      totals.set(rule.id, (totals.get(rule.id) ?? 0) + off)
      if (rule.exclusive) stopped.add(line.key)
    }
  }
  const applied: AppliedRule[] = []
  for (const rule of live) {
    const cents = totals.get(rule.id)
    if (cents) applied.push({ id: rule.id, name: rule.name, cents })
  }
  const totalCents = Object.values(lineDiscounts).reduce((s, n) => s + n, 0)
  return { lineDiscounts, applied, totalCents }
}

/** The line shown under the quantity box on the product page, e.g. "Buy 10 or more and save 10%". */
export function ruleNote(rule: PricingRule): string {
  const off = rule.discountType === 'percent' ? `${rule.amount}% off` : `$${rule.amount.toFixed(2)} off each item`
  switch (rule.appliesWhen) {
    case 'quantity':
      return `Buy ${rule.minQuantity} or more and get ${off}.`
    case 'subtotal':
      return `Spend $${(rule.minSubtotalCents / 100).toFixed(2)} or more in your cart and get ${off}.`
    case 'category':
      return rule.category ? `${off} on ${rule.category} items.` : `${off}.`
    case 'role':
      return `${off} for ${rule.customerRole || 'selected'} customers.`
    default:
      return `${off}.`
  }
}

/** The product page notes for live rules the shop has chosen to show. */
export function productPageNotes(rules: PricingRule[], now: Date = new Date()): string[] {
  return rules.filter((rule) => rule.showOnProduct && rule.appliesWhen !== 'role' && ruleIsLive(rule, now)).map(ruleNote)
}
