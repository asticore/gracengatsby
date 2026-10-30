/*
 * Turns a tracking event's value source into the number and currency sent to the platforms, at the moment the event
 * fires. Pure: the runtime and the editor's live preview gather the page facts (text, attributes, cart total) and pass
 * them in. Parsing is strict: a value that cannot be read is null, never a guess.
 */
import type { TrackingEventDef, ValueSource } from './events'

/** Currencies a page is likely to print as a three-letter code. Anything else in capitals is not treated as a code. */
const KNOWN_CODES = new Set([
  'AUD', 'NZD', 'USD', 'CAD', 'GBP', 'EUR', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY', 'CNY', 'HKD', 'SGD', 'KRW', 'INR',
  'BRL', 'MXN', 'ZAR', 'AED', 'PLN', 'CZK', 'HUF', 'ILS', 'THB', 'MYR', 'PHP', 'IDR', 'TWD', 'RUB', 'TRY', 'SAR',
])

export type ParsedMoney = { value: number; currency: string | null }

/**
 * A price read from text: "$1,234.50", "AUD 12.00", "1.234,50 €", "12,50". The decimal separator is the last of "." and
 * "," when both appear; a lone separator with exactly two digits after it is a decimal, otherwise it groups thousands.
 * Negative and non-numeric text returns null.
 */
export function parseMoney(text: string | null | undefined): ParsedMoney | null {
  if (!text) return null
  // A minus sign before a number makes it a credit or a refund, which is never a sale value.
  if (/(^|[\s$€£])-\s*\d/.test(text)) return null
  const upper = text.toUpperCase()
  const code = (upper.match(/\b[A-Z]{3}\b/g) ?? []).find((c) => KNOWN_CODES.has(c)) ?? null
  const found = /\d[\d.,'  ]*\d|\d/.exec(text)
  if (!found) return null
  const raw = found[0].replace(/[  ']/g, '')
  const lastDot = raw.lastIndexOf('.')
  const lastComma = raw.lastIndexOf(',')
  let normalised: string
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ','
    const thousands = decimal === '.' ? ',' : '.'
    normalised = raw.split(thousands).join('').replace(decimal, '.')
  } else if (lastComma >= 0) {
    const digitsAfter = raw.length - lastComma - 1
    normalised = raw.indexOf(',') === lastComma && digitsAfter === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '')
  } else if (lastDot >= 0) {
    const dots = raw.split('.').length - 1
    const digitsAfter = raw.length - lastDot - 1
    normalised = dots === 1 && digitsAfter <= 2 ? raw : raw.replace(/\./g, '')
  } else {
    normalised = raw
  }
  const value = Number(normalised)
  if (!Number.isFinite(value) || value < 0) return null
  return { value: Math.round(value * 100) / 100, currency: code }
}

/** The facts the page can supply. Every field is optional: a missing fact resolves to null. */
export type ValueContext = {
  /** Text of the clicked element, or of the element the value selector names. */
  elementText?: string | null
  /** The attribute named by valueRef, on the clicked element or the value selector's element. */
  elementAttr?: (name: string) => string | null | undefined
  /** Cart subtotal in major units, with its currency. From the site's cart. */
  cart?: { amount: number; currency: string | null } | null
  /** Text of the product price on a product page. */
  productPriceText?: string | null
  /** Text of the order total on an order confirmation page. */
  orderTotalText?: string | null
  quantity?: number | null
  /** Reads a data layer variable by name. */
  dataLayer?: (name: string) => unknown
  /** The site's default currency (payment settings). */
  siteCurrency?: string | null
}

export type ResolvedValue = { value: number | null; currency: string | null; source: ValueSource }

const money = (amount: number | null | undefined, currency: string | null | undefined, fallback: string | null) =>
  amount == null || !Number.isFinite(amount) ? null : { value: Math.round(amount * 100) / 100, currency: currency ?? fallback }

/** The value and currency one event sends, from its source. The fixed value and currency are used as written. */
export function resolveTagValue(def: Pick<TrackingEventDef, 'valueSource' | 'valueRef' | 'value' | 'currency'>, ctx: ValueContext): ResolvedValue {
  const source = (def.valueSource ?? 'none') as ValueSource
  const site = ctx.siteCurrency ?? null
  const none: ResolvedValue = { value: null, currency: null, source }
  let picked: { value: number; currency: string | null } | null = null
  switch (source) {
    case 'none':
      return none
    case 'fixed':
      picked = def.value == null ? null : { value: def.value, currency: null }
      break
    case 'cartTotal':
      picked = ctx.cart ? { value: ctx.cart.amount, currency: ctx.cart.currency } : null
      break
    case 'productPrice':
      picked = parseMoney(ctx.productPriceText)
      break
    case 'orderTotal':
      picked = parseMoney(ctx.orderTotalText)
      break
    case 'quantity':
      picked = ctx.quantity != null && Number.isInteger(ctx.quantity) && ctx.quantity > 0 ? { value: ctx.quantity, currency: null } : null
      break
    case 'elementText':
      picked = parseMoney(ctx.elementText)
      break
    case 'elementAttr':
      picked = parseMoney(ctx.elementAttr?.((def.valueRef ?? '').trim()) ?? null)
      break
    case 'dataLayer': {
      const raw = ctx.dataLayer?.((def.valueRef ?? '').trim())
      picked = typeof raw === 'number' ? (raw >= 0 && Number.isFinite(raw) ? { value: raw, currency: null } : null) : parseMoney(typeof raw === 'string' ? raw : null)
      break
    }
  }
  if (!picked) return none
  // A currency the page printed wins; then the event's own currency; then the site default.
  const resolved = money(picked.value, picked.currency ?? def.currency ?? site, site)
  return resolved ? { ...resolved, source } : none
}
