/**
 * Payment method rules: Afterpay/Clearpay and Klarna ("pay in 4" / pay later) through the Stripe
 * Payment Element, plus Apple Pay and Google Pay (wallets that ride on the card method).
 *
 * Pure: settings in, decisions out. Callers load the `payment-settings` global.
 */

export type BnplProvider = 'afterpay' | 'klarna'

export type BnplSettings = {
  enabled: boolean
  /** dollars; 0 = no minimum */
  minOrder: number
  /** dollars; 0 = no maximum */
  maxOrder: number
  /** ISO country codes the customer's shipping country must be in. Empty = provider default. */
  countries: string[]
  /** ISO currencies. Empty = provider default. */
  currencies: string[]
  showMessaging: boolean
  instalments: number
}

export const BNPL_DEFAULTS: Record<BnplProvider, { label: string; countries: string[]; currencies: string[]; min: number; max: number; stripeType: string; instalments: number }> = {
  afterpay: { label: 'Afterpay', countries: ['AU', 'NZ', 'US', 'GB', 'CA'], currencies: ['AUD', 'NZD', 'USD', 'GBP', 'CAD'], min: 1, max: 2000, stripeType: 'afterpay_clearpay', instalments: 4 },
  klarna: { label: 'Klarna', countries: ['AU', 'NZ', 'US', 'GB', 'CA', 'DE', 'AT', 'NL', 'BE', 'FR', 'IT', 'ES', 'SE', 'DK', 'NO', 'FI', 'IE'], currencies: ['AUD', 'NZD', 'USD', 'GBP', 'CAD', 'EUR', 'SEK', 'DKK', 'NOK'], min: 1, max: 1000, stripeType: 'klarna', instalments: 4 },
}

const codes = (v: unknown): string[] => {
  const text = Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : ''
  return text
    .split(/[,\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2,3}$/.test(c))
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)

export function normaliseBnpl(provider: BnplProvider, raw: unknown): BnplSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = BNPL_DEFAULTS[provider]
  return {
    enabled: r.enabled === true,
    minOrder: num(r.minOrder, d.min),
    maxOrder: num(r.maxOrder, d.max),
    countries: codes(r.countries),
    currencies: codes(r.currencies),
    showMessaging: r.showMessaging !== false,
    instalments: Math.min(12, Math.max(2, Math.floor(num(r.instalments, d.instalments)))),
  }
}

export type BnplContext = { amountCents: number; country?: string | null; currency: string }

/** `{ ok: true }` when the method may be offered for this order, otherwise why not (shown to staff, not shoppers). */
export function bnplAvailability(provider: BnplProvider, settings: BnplSettings, ctx: BnplContext): { ok: true } | { ok: false; reason: string } {
  if (!settings.enabled) return { ok: false, reason: 'turned off' }
  const d = BNPL_DEFAULTS[provider]
  const currencies = settings.currencies.length > 0 ? settings.currencies : d.currencies
  if (!currencies.includes(ctx.currency.toUpperCase())) return { ok: false, reason: `currency ${ctx.currency} not allowed` }
  const countries = settings.countries.length > 0 ? settings.countries : d.countries
  const country = (ctx.country ?? '').trim().toUpperCase()
  if (country && !countries.includes(country)) return { ok: false, reason: `country ${country} not allowed` }
  const amount = ctx.amountCents
  if (settings.minOrder > 0 && amount < Math.round(settings.minOrder * 100)) return { ok: false, reason: 'below the minimum order value' }
  if (settings.maxOrder > 0 && amount > Math.round(settings.maxOrder * 100)) return { ok: false, reason: 'above the maximum order value' }
  return { ok: true }
}

/** Splits an amount into `n` instalments whose parts add up exactly; the first one carries the remainder. */
export function instalments(amountCents: number, n = 4): number[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || n < 2) return []
  const base = Math.floor(amountCents / n)
  const rest = amountCents - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base))
}

const money = (cents: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** "or 4 interest-free payments of $25.00 with Afterpay". Null when the amount is outside the provider's range. */
export function bnplMessage(provider: BnplProvider, settings: BnplSettings, ctx: BnplContext): string | null {
  if (!settings.showMessaging) return null
  if (!bnplAvailability(provider, settings, ctx).ok) return null
  const parts = instalments(ctx.amountCents, settings.instalments)
  if (parts.length === 0) return null
  const label = BNPL_DEFAULTS[provider].label
  const each = money(Math.ceil(ctx.amountCents / settings.instalments), ctx.currency)
  const even = parts.every((p) => p === parts[1])
  return `or ${settings.instalments} ${provider === 'klarna' ? '' : 'interest-free '}payments of ${even ? '' : 'about '}${each} with ${label}`.replace(/\s+/g, ' ')
}

export type PaymentSettingsLike = { afterpay?: unknown; klarna?: unknown; wallets?: unknown; general?: { currency?: string } | null }

/**
 * The Stripe `payment_method_types` to put on a PaymentIntent, or null to let Stripe choose with
 * `automatic_payment_methods`. Explicit types are used only when a pay-later method is switched on,
 * because the shop's min/max/country rules have to decide whether it appears. Apple Pay and Google
 * Pay need no entry: they are shown by the Payment Element for the `card` method.
 */
export function stripeMethodTypes(settings: PaymentSettingsLike | null | undefined, ctx: BnplContext): string[] | null {
  const a = normaliseBnpl('afterpay', settings?.afterpay)
  const k = normaliseBnpl('klarna', settings?.klarna)
  if (!a.enabled && !k.enabled) return null
  const types = ['card']
  if (bnplAvailability('afterpay', a, ctx).ok) types.push(BNPL_DEFAULTS.afterpay.stripeType)
  if (bnplAvailability('klarna', k, ctx).ok) types.push(BNPL_DEFAULTS.klarna.stripeType)
  return types
}

export type WalletSettings = { applePay: boolean; googlePay: boolean }

export function normaliseWallets(raw: unknown): WalletSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { applePay: r.applePay !== false, googlePay: r.googlePay !== false }
}

/** What the storefront may know about payments. Never includes a secret. */
export function publicPaymentConfig(settings: PaymentSettingsLike | null | undefined, currency: string): {
  afterpay: { enabled: boolean; label: string; minCents: number; maxCents: number; countries: string[]; currencies: string[]; instalments: number; messaging: boolean }
  klarna: { enabled: boolean; label: string; minCents: number; maxCents: number; countries: string[]; currencies: string[]; instalments: number; messaging: boolean }
  wallets: WalletSettings
  currency: string
} {
  const shape = (p: BnplProvider, raw: unknown) => {
    const s = normaliseBnpl(p, raw)
    const d = BNPL_DEFAULTS[p]
    return {
      enabled: s.enabled,
      label: d.label,
      minCents: Math.round(s.minOrder * 100),
      maxCents: Math.round(s.maxOrder * 100),
      countries: s.countries.length > 0 ? s.countries : d.countries,
      currencies: s.currencies.length > 0 ? s.currencies : d.currencies,
      instalments: s.instalments,
      messaging: s.showMessaging,
    }
  }
  return { afterpay: shape('afterpay', settings?.afterpay), klarna: shape('klarna', settings?.klarna), wallets: normaliseWallets(settings?.wallets), currency }
}

/** Messaging for the browser, from the public config above. Same rules as bnplMessage. */
export function messagesFromPublicConfig(cfg: ReturnType<typeof publicPaymentConfig>, amountCents: number, country?: string | null): string[] {
  const out: string[] = []
  for (const p of ['afterpay', 'klarna'] as const) {
    const c = cfg[p]
    if (!c.enabled || !c.messaging) continue
    const msg = bnplMessage(
      p,
      { enabled: true, minOrder: c.minCents / 100, maxOrder: c.maxCents / 100, countries: c.countries, currencies: c.currencies, showMessaging: true, instalments: c.instalments },
      { amountCents, country, currency: cfg.currency },
    )
    if (msg) out.push(msg)
  }
  return out
}
