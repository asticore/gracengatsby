/**
 * Stored value: gift cards (a code with a balance) and store credit (a balance on a customer
 * account). Pure helpers only; the atomic debit lives in ../server/storedValue.ts.
 *
 * All amounts are whole cents. Neither kind can pay for a gift card (that would let stolen card
 * money be turned into spendable credit), so the amount stored value may cover is capped at the
 * total minus gift card lines.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L

/** XXXX-XXXX-XXXX-XXXX. `random` is injectable for tests; default uses Web Crypto. */
export function generateGiftCardCode(random?: (n: number) => number[]): string {
  const bytes = random ? random(16) : Array.from(crypto.getRandomValues(new Uint8Array(16)))
  const chars = bytes.map((b) => ALPHABET[b % ALPHABET.length])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

/** Upper-cases, strips spaces and dashes and re-inserts the dashes. Returns '' for anything that is not 16 valid characters. */
export function normaliseGiftCardCode(input: unknown): string {
  if (typeof input !== 'string') return ''
  const flat = input.toUpperCase().replace(/[\s-]/g, '')
  if (flat.length !== 16 || ![...flat].every((c) => ALPHABET.includes(c))) return ''
  return [0, 4, 8, 12].map((i) => flat.slice(i, i + 4)).join('-')
}

export type GiftCardSettings = {
  enabled: boolean
  allowCustomAmount: boolean
  /** dollars */
  minAmount: number
  maxAmount: number
  presetAmounts: number[]
  /** months until a new card expires; 0 = never */
  expiryMonths: number
  storeCreditEnabled: boolean
}

export const DEFAULT_GIFT_CARD_SETTINGS: GiftCardSettings = {
  enabled: true,
  allowCustomAmount: true,
  minAmount: 10,
  maxAmount: 500,
  presetAmounts: [25, 50, 100],
  expiryMonths: 0,
  storeCreditEnabled: true,
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function parsePresetAmounts(value: unknown): number[] {
  const text = Array.isArray(value) ? value.join(',') : typeof value === 'string' ? value : ''
  const out = text
    .split(/[,\s]+/)
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 100000)
    .map((n) => Math.round(n * 100) / 100)
  return [...new Set(out)].sort((a, b) => a - b).slice(0, 12)
}

export function normaliseGiftCardSettings(raw: unknown): GiftCardSettings {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_GIFT_CARD_SETTINGS
  const presets = parsePresetAmounts(g.presetAmounts)
  return {
    enabled: g.enabled !== false,
    allowCustomAmount: g.allowCustomAmount !== false,
    minAmount: Math.max(1, num(g.minAmount, d.minAmount)),
    maxAmount: Math.max(1, num(g.maxAmount, d.maxAmount)),
    presetAmounts: presets.length > 0 ? presets : d.presetAmounts,
    expiryMonths: Math.max(0, Math.floor(num(g.expiryMonths, d.expiryMonths))),
    storeCreditEnabled: g.storeCreditEnabled !== false,
  }
}

/** Validates the amount (in cents) a buyer chose for a new gift card. Returns an error message or null. */
export function giftAmountError(cents: unknown, settings: GiftCardSettings): string | null {
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents <= 0) return 'Choose a gift card amount.'
  const isPreset = settings.presetAmounts.some((p) => Math.round(p * 100) === cents)
  if (isPreset) return null
  if (!settings.allowCustomAmount) return 'Choose one of the listed gift card amounts.'
  if (cents < Math.round(settings.minAmount * 100)) return `The smallest gift card is $${settings.minAmount}.`
  if (cents > Math.round(settings.maxAmount * 100)) return `The largest gift card is $${settings.maxAmount}.`
  return null
}

export type GiftCardRecipient = { name?: string; email?: string; senderName?: string; message?: string; sendAt?: string | null }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Cleans recipient details from the browser. Returns the clean value or an error. */
export function cleanRecipient(
  input: unknown,
  now: Date = new Date(),
): { ok: true; value: { name: string; email: string; senderName: string; message: string; sendAt: string | null } } | { ok: false; error: string } {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const email = str(r.email, 200).toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter the recipient email address.' }
  let sendAt: string | null = null
  const rawSend = str(r.sendAt, 40)
  if (rawSend) {
    const t = new Date(rawSend)
    if (Number.isNaN(t.getTime())) return { ok: false, error: 'The send date is not valid.' }
    // A date more than a year ahead is almost certainly a typo.
    if (t.getTime() > now.getTime() + 366 * 86400_000) return { ok: false, error: 'The send date must be within a year.' }
    sendAt = t.getTime() <= now.getTime() ? null : t.toISOString()
  }
  return { ok: true, value: { name: str(r.name, 100), email, senderName: str(r.senderName, 100), message: str(r.message, 500), sendAt } }
}

export type GiftCardLike = {
  id: number | string
  code?: string | null
  balance?: number | null
  currency?: string | null
  status?: string | null
  expiresAt?: string | null
  restrictProduct?: number | string | null
}

/** Null when the card can be spent now, otherwise a short reason. */
export function giftCardUnusable(card: GiftCardLike | null | undefined, currency: string, now: Date = new Date()): string | null {
  if (!card) return 'Gift card not found.'
  if (card.status !== 'active') return card.status === 'pending' ? 'This gift card has not been delivered yet.' : 'This gift card cannot be used.'
  if ((card.balance ?? 0) <= 0) return 'This gift card has no balance left.'
  if (card.expiresAt && new Date(card.expiresAt).getTime() < now.getTime()) return 'This gift card has expired.'
  if (card.currency && card.currency.toUpperCase() !== currency.toUpperCase()) return 'This gift card is in a different currency.'
  return null
}

export function expiryFor(settings: GiftCardSettings, now: Date = new Date()): string | null {
  if (!settings.expiryMonths) return null
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() + settings.expiryMonths)
  return d.toISOString()
}

export type StoredValueLine = { productId: string; netCents: number; isGiftCard?: boolean }

export type StoredValuePlan = {
  giftCards: { id: number | string; code: string; cents: number }[]
  creditCents: number
  coveredCents: number
  /** What is left to pay by card. */
  payableCents: number
}

/**
 * Works out how much stored value to use against an order. Gift cards are used first (in the order
 * given), then store credit when `useCredit` is set. A card restricted to one product (a course or
 * membership voucher) only covers that product's lines. Never exceeds the cap or a balance.
 */
export function planStoredValue(args: {
  totalCents: number
  lines: StoredValueLine[]
  giftCards: (GiftCardLike & { balance: number; code: string })[]
  creditBalanceCents: number
  useCredit: boolean
}): StoredValuePlan {
  const giftLines = args.lines.filter((l) => l.isGiftCard).reduce((s, l) => s + l.netCents, 0)
  let cap = Math.max(0, args.totalCents - giftLines)
  const uses: StoredValuePlan['giftCards'] = []
  let covered = 0
  let restrictedCovered = 0
  for (const card of args.giftCards) {
    if (cap <= 0) break
    let eligible = cap
    if (card.restrictProduct != null && String(card.restrictProduct) !== '') {
      const matching = args.lines.filter((l) => !l.isGiftCard && String(l.productId) === String(card.restrictProduct)).reduce((s, l) => s + l.netCents, 0)
      eligible = Math.min(cap, Math.max(0, matching - restrictedCovered))
    }
    const take = Math.min(eligible, Math.max(0, card.balance))
    if (take <= 0) continue
    if (card.restrictProduct != null && String(card.restrictProduct) !== '') restrictedCovered += take
    uses.push({ id: card.id, code: card.code, cents: take })
    covered += take
    cap -= take
  }
  let credit = 0
  if (args.useCredit && cap > 0) {
    credit = Math.min(cap, Math.max(0, args.creditBalanceCents))
    covered += credit
  }
  return { giftCards: uses, creditCents: credit, coveredCents: covered, payableCents: args.totalCents - covered }
}

export type LedgerEntry = {
  kind: 'gift-card' | 'store-credit'
  direction: 'credit' | 'debit'
  amount: number
  balanceAfter: number
  reason: string
  giftCard?: number
  user?: number
  order?: number
  createdBy?: number
}

/** The code with all but the last four characters hidden, for notes that must not carry the whole code. */
export const maskGiftCardCode = (code: string): string => (code.length > 4 ? `XXXX-XXXX-XXXX-${code.slice(-4)}` : code)
