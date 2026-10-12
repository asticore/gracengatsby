import { sendEmail } from '@/features/email'

import { formatCents } from '../lib/money'
import {
  expiryFor,
  generateGiftCardCode,
  giftCardUnusable,
  maskGiftCardCode,
  normaliseGiftCardCode,
  normaliseGiftCardSettings,
  planStoredValue,
  type GiftCardSettings,
  type LedgerEntry,
  type StoredValueLine,
  type StoredValuePlan,
} from '../lib/storedValue'
import { enforceMinimumCard, parseSnapshot, type StoredValueSnapshot } from '../lib/storedValueOrder'
import { rawD1, runChanges } from './db'
import { mergeFields } from './emails'

type Doc = Record<string, unknown>
export type StoredValueEngine = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findByID: (a: unknown) => Promise<Doc | null>
  update: (a: unknown) => Promise<Doc>
  create: (a: unknown) => Promise<Doc>
  findGlobal: (a: unknown) => Promise<Doc>
}

export async function loadGiftCardSettings(engine: StoredValueEngine): Promise<GiftCardSettings> {
  try {
    const shop = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })
    return normaliseGiftCardSettings(shop?.giftCards)
  } catch {
    return normaliseGiftCardSettings(null)
  }
}

export async function writeLedger(engine: StoredValueEngine, entry: LedgerEntry): Promise<void> {
  try {
    await engine.create({ collection: 'credit-ledger', data: entry, overrideAccess: true })
  } catch (error) {
    // The balance has already moved; a missing ledger row must be visible in the logs.
    console.error('credit ledger write failed:', error instanceof Error ? error.message : error)
  }
}

/** Store credit balance in cents for a user (0 when they have no row). */
export async function creditBalance(userId: number): Promise<number> {
  const d1 = await rawD1()
  const row = await d1.prepare('SELECT balance FROM eg_store_credits WHERE user_id = ?1').bind(userId).first<{ balance: number }>()
  return Number(row?.balance ?? 0)
}

const STAMP = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

/**
 * Adds (positive) or deducts (negative) store credit in one atomic statement and writes the ledger.
 * A deduction that would take the balance below zero changes nothing and throws.
 */
export async function adjustStoreCredit(
  engine: StoredValueEngine,
  args: { userId: number; deltaCents: number; reason: string; orderId?: number; createdBy?: number },
): Promise<number> {
  const { userId, deltaCents } = args
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('Choose a customer.')
  if (!Number.isInteger(deltaCents) || deltaCents === 0) throw new Error('Enter an amount.')
  if (Math.abs(deltaCents) > 10_000_000) throw new Error('That amount is too large.')
  const d1 = await rawD1()
  await d1.prepare('INSERT OR IGNORE INTO eg_store_credits (user_id, balance) VALUES (?1, 0)').bind(userId).run()
  const changed =
    deltaCents > 0
      ? await runChanges(d1, `UPDATE eg_store_credits SET balance = COALESCE(balance,0) + ?2, updated_at = ${STAMP} WHERE user_id = ?1`, userId, deltaCents)
      : await runChanges(d1, `UPDATE eg_store_credits SET balance = COALESCE(balance,0) + ?2, updated_at = ${STAMP} WHERE user_id = ?1 AND COALESCE(balance,0) >= ?3`, userId, deltaCents, -deltaCents)
  if (changed === 0) throw new Error('The customer does not have that much store credit.')
  const balance = await creditBalance(userId)
  await writeLedger(engine, {
    kind: 'store-credit',
    direction: deltaCents > 0 ? 'credit' : 'debit',
    amount: Math.abs(deltaCents),
    balanceAfter: balance,
    reason: args.reason.slice(0, 300),
    user: userId,
    ...(args.orderId ? { order: args.orderId } : {}),
    ...(args.createdBy ? { createdBy: args.createdBy } : {}),
  })
  return balance
}

const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: number }).id) : Number(v) || null)

type FoundCard = Doc & { id: number; code: string; balance: number }

/** Looks the typed codes up. Unknown or malformed codes are counted, never described. */
export async function findGiftCards(engine: StoredValueEngine, rawCodes: unknown): Promise<{ cards: FoundCard[]; unknown: number }> {
  const asked = Array.isArray(rawCodes) ? rawCodes.slice(0, 5) : []
  const codes = [...new Set(asked.map(normaliseGiftCardCode).filter(Boolean))]
  const cards: FoundCard[] = []
  let unknown = asked.length - codes.length
  for (const code of codes) {
    const found = (await engine.find({ collection: 'gift-cards', where: { code: { equals: code } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    if (found) cards.push({ ...found, id: Number(found.id), code, balance: Number(found.balance ?? 0) })
    else unknown++
  }
  return { cards, unknown }
}

export type StoredValueQuote = {
  plan: StoredValuePlan
  snapshot: StoredValueSnapshot
  errors: string[]
  /** For display: masked codes with the amount each will cover. */
  cards: { code: string; cents: number; balanceCents: number }[]
  creditBalanceCents: number
}

/**
 * What stored value would pay on an order of `totalCents`. Never trusts the browser for amounts: it only
 * supplies codes and the "use my credit" choice. Balances and statuses are read here.
 */
export async function quoteStoredValue(
  engine: StoredValueEngine,
  args: { codes: unknown; useCredit: boolean; userId: number | null; totalCents: number; lines: StoredValueLine[]; currency: string },
): Promise<StoredValueQuote> {
  const settings = await loadGiftCardSettings(engine)
  const errors: string[] = []
  if (!settings.enabled && !settings.storeCreditEnabled) {
    return { plan: { giftCards: [], creditCents: 0, coveredCents: 0, payableCents: args.totalCents }, snapshot: { giftCards: [], creditUserId: null, creditCents: 0 }, errors, cards: [], creditBalanceCents: 0 }
  }
  const usable: FoundCard[] = []
  if (settings.enabled) {
    const { cards, unknown } = await findGiftCards(engine, args.codes)
    if (unknown > 0) errors.push('Gift card not found.')
    const now = new Date()
    for (const card of cards) {
      const why = giftCardUnusable({ ...card, restrictProduct: idOf(card.restrictProduct) } as never, args.currency, now)
      if (why) errors.push(why)
      else usable.push(card)
    }
  }
  const balance = settings.storeCreditEnabled && args.userId ? await creditBalance(args.userId) : 0
  let plan = planStoredValue({
    totalCents: args.totalCents,
    lines: args.lines,
    giftCards: usable.map((c) => ({ id: c.id, code: c.code, balance: c.balance, restrictProduct: idOf(c.restrictProduct) })),
    creditBalanceCents: balance,
    useCredit: args.useCredit && settings.storeCreditEnabled && Boolean(args.userId),
  })
  plan = enforceMinimumCard(plan, args.totalCents)
  const snapshot: StoredValueSnapshot = {
    giftCards: plan.giftCards.map((c) => ({ id: Number(c.id), code: c.code, cents: c.cents })),
    creditUserId: plan.creditCents > 0 ? args.userId : null,
    creditCents: plan.creditCents,
  }
  return {
    plan,
    snapshot,
    errors,
    cards: plan.giftCards.map((c) => ({ code: maskGiftCardCode(c.code), cents: c.cents, balanceCents: usable.find((u) => u.id === c.id)?.balance ?? 0 })),
    creditBalanceCents: balance,
  }
}

/**
 * Takes the stored value saved on an order out of the cards and the account, once (guarded by a one-shot flag).
 * Every debit is one conditional UPDATE, so two orders racing for the same balance cannot both take it.
 *  - strict (used before an order is marked paid when stored value covers it all): any shortfall undoes what was
 *    taken and returns ok:false, so the order is never fulfilled on money that is not there.
 *  - lenient (after a card payment already went through): takes what it can and reports the shortfall.
 */
export async function consumeStoredValue(engine: StoredValueEngine, order: Doc, mode: 'strict' | 'lenient'): Promise<{ ok: boolean; shortfallCents: number }> {
  const orderId = Number(order.id)
  const snap = parseSnapshot(order.storedValue)
  if (snap.giftCards.length === 0 && snap.creditCents === 0) return { ok: true, shortfallCents: 0 }
  const d1 = await rawD1()
  if ((await runChanges(d1, 'UPDATE eg_orders SET stored_value_applied = 1 WHERE id = ?1 AND COALESCE(stored_value_applied,0) = 0', orderId)) === 0) return { ok: true, shortfallCents: 0 }

  const taken: { kind: 'card' | 'credit'; id: number; cents: number }[] = []
  let shortfall = 0
  for (const c of snap.giftCards) {
    const n = await runChanges(
      d1,
      `UPDATE eg_gift_cards SET balance = COALESCE(balance,0) - ?2, updated_at = ${STAMP} WHERE id = ?1 AND status = 'active' AND COALESCE(balance,0) >= ?2 AND (expires_at IS NULL OR expires_at > ?3)`,
      c.id,
      c.cents,
      new Date().toISOString(),
    )
    if (n === 0) shortfall += c.cents
    else taken.push({ kind: 'card', id: c.id, cents: c.cents })
  }
  if (snap.creditCents > 0 && snap.creditUserId) {
    const n = await runChanges(d1, `UPDATE eg_store_credits SET balance = COALESCE(balance,0) - ?2, updated_at = ${STAMP} WHERE user_id = ?1 AND COALESCE(balance,0) >= ?2`, snap.creditUserId, snap.creditCents)
    if (n === 0) shortfall += snap.creditCents
    else taken.push({ kind: 'credit', id: snap.creditUserId, cents: snap.creditCents })
  }
  if (shortfall > 0 && mode === 'strict') {
    for (const t of taken) {
      if (t.kind === 'card') await runChanges(d1, 'UPDATE eg_gift_cards SET balance = COALESCE(balance,0) + ?2 WHERE id = ?1', t.id, t.cents)
      else await runChanges(d1, 'UPDATE eg_store_credits SET balance = COALESCE(balance,0) + ?2 WHERE user_id = ?1', t.id, t.cents)
    }
    await runChanges(d1, 'UPDATE eg_orders SET stored_value_applied = 0 WHERE id = ?1', orderId)
    return { ok: false, shortfallCents: shortfall }
  }
  for (const t of taken) {
    if (t.kind === 'card') {
      const row = await d1.prepare('SELECT balance FROM eg_gift_cards WHERE id = ?1').bind(t.id).first<{ balance: number }>()
      await writeLedger(engine, { kind: 'gift-card', direction: 'debit', amount: t.cents, balanceAfter: Number(row?.balance ?? 0), reason: `Used on order #${orderId}`, giftCard: t.id, order: orderId })
    } else {
      await writeLedger(engine, { kind: 'store-credit', direction: 'debit', amount: t.cents, balanceAfter: await creditBalance(t.id), reason: `Used on order #${orderId}`, user: t.id, order: orderId })
    }
  }
  return { ok: shortfall === 0, shortfallCents: shortfall }
}

/** Refund to store credit: needs an account to hold it. */
export async function refundToStoreCredit(engine: StoredValueEngine, order: Doc, cents: number, opts: { reason: string; createdBy?: number }): Promise<number> {
  const customer = idOf(order.customer)
  if (!customer) throw new Error('Only a customer with an account can receive store credit. Refund this order to the card or record it as manual.')
  return adjustStoreCredit(engine, { userId: customer, deltaCents: cents, reason: opts.reason, orderId: Number(order.id), createdBy: opts.createdBy })
}

/* ---------------------------- gift card issuing ----------------------------- */

type GiftLine = {
  isGiftCard?: boolean
  quantity?: number
  giftAmountCents?: number
  recipient?: { name?: string; email?: string; senderName?: string; message?: string; sendAt?: string | null }
}

/** Creates one card per unit of every gift card line on a paid order, once. Cards with a future send date wait as pending. */
export async function issueGiftCards(engine: StoredValueEngine, order: Doc): Promise<number> {
  const lines = (Array.isArray(order.lineItems) ? order.lineItems : []) as GiftLine[]
  const gift = lines.filter((l) => l.isGiftCard && (l.giftAmountCents ?? 0) > 0)
  if (gift.length === 0) return 0
  const orderId = Number(order.id)
  const d1 = await rawD1()
  if ((await runChanges(d1, 'UPDATE eg_orders SET gift_cards_issued = 1 WHERE id = ?1 AND COALESCE(gift_cards_issued,0) = 0', orderId)) === 0) return 0
  const settings = await loadGiftCardSettings(engine)
  const now = new Date()
  let made = 0
  // A replay after a partial failure only makes the units that have no card yet (units are numbered in order across lines).
  const have = await engine.find({ collection: 'gift-cards', where: { order: { equals: orderId } }, limit: 500, depth: 0, overrideAccess: true }).then((r) => r.docs.length).catch(() => 0)
  let index = 0
  try {
    for (const line of gift) {
      for (let unit = 0; unit < Math.min(line.quantity ?? 1, 50); unit++) {
        if (index++ < have) continue
        const r = line.recipient ?? {}
        const future = Boolean(r.sendAt && new Date(r.sendAt).getTime() > now.getTime())
        let card: Doc | null = null
        for (let attempt = 0; attempt < 5 && !card; attempt++) {
          try {
            card = await engine.create({
              collection: 'gift-cards',
              data: {
                code: generateGiftCardCode(),
                initialAmount: line.giftAmountCents,
                currency: String(order.currency || 'AUD'),
                status: future ? 'pending' : 'active',
                expiresAt: expiryFor(settings, now),
                recipientName: r.name ?? '',
                recipientEmail: r.email ?? '',
                senderName: r.senderName ?? '',
                message: r.message ?? '',
                sendAt: r.sendAt ?? null,
                purchaserEmail: typeof order.customerEmail === 'string' ? order.customerEmail : null,
                order: orderId,
              },
              overrideAccess: true,
            })
          } catch (error) {
            // A duplicate code is retried with a new one; any other failure stops here.
            if (attempt === 4 || !/unique|constraint|already/i.test(error instanceof Error ? error.message : '')) throw error
          }
        }
        if (!card) continue
        made++
        await writeLedger(engine, { kind: 'gift-card', direction: 'credit', amount: Number(line.giftAmountCents), balanceAfter: Number(line.giftAmountCents), reason: `Issued for order #${orderId}`, giftCard: Number(card.id), order: orderId })
        if (!future) await deliverGiftCard(engine, { ...card, id: Number(card.id) })
      }
    }
  } catch (error) {
    // Let a replay try again for the cards that were not made.
    await runChanges(d1, 'UPDATE eg_orders SET gift_cards_issued = 0 WHERE id = ?1', orderId)
    console.error('gift card issue failed:', error instanceof Error ? error.message : error)
    throw error
  }
  return made
}

const DEFAULT_GIFT_SUBJECT = '{{sender_name}} sent you a gift card for {{site_name}}'
const DEFAULT_GIFT_BODY =
  'Hi {{recipient_name}},\n\n{{sender_name}} sent you a {{amount}} gift card for {{site_name}}.\n\n{{message}}\n\nYour code: {{code}}\n\nEnter it at checkout to use it. The balance can be spent over several orders.'

export function renderGiftCardEmail(card: Doc, templates: unknown, siteName: string): { subject: string; text: string; html: string } {
  const t = (templates && typeof templates === 'object' ? templates : {}) as Record<string, unknown>
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 5000) : undefined)
  const values: Record<string, string> = {
    recipient_name: String(card.recipientName || 'there'),
    sender_name: String(card.senderName || 'Someone'),
    amount: formatCents(Number(card.initialAmount ?? 0), String(card.currency || 'AUD')),
    message: String(card.message ?? ''),
    code: String(card.code ?? ''),
    site_name: siteName,
  }
  const subject = mergeFields(clean(t.giftCardSubject) ?? DEFAULT_GIFT_SUBJECT, values, false).replace(/[\r\n]+/g, ' ')
  const body = clean(t.giftCardBody) ?? DEFAULT_GIFT_BODY
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${mergeFields(body, values, true).replace(/\n/g, '<br>')}</div>`
  return { subject, text: mergeFields(body, values, false), html }
}

/** Emails a card to its recipient (or the buyer when no recipient) and records when. Marks a pending card active. Never throws. */
export async function deliverGiftCard(engine: StoredValueEngine, card: Doc & { id: number }): Promise<boolean> {
  try {
    if (card.status === 'disabled') return false
    if (card.expiresAt && new Date(String(card.expiresAt)).getTime() <= Date.now()) return false
    const to = (typeof card.recipientEmail === 'string' && card.recipientEmail) || (typeof card.purchaserEmail === 'string' ? card.purchaserEmail : '')
    if (!to) return false
    const settings = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as { templates?: unknown }
    const site = (await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): Doc => ({}))) as { siteName?: string }
    const msg = renderGiftCardEmail(card, settings.templates, site.siteName ?? 'our shop')
    const result = await sendEmail({ to, ...msg })
    if (!result.ok) return false
    await engine.update({ collection: 'gift-cards', id: card.id, data: { status: 'active', sentAt: new Date().toISOString() }, overrideAccess: true })
    return true
  } catch {
    return false
  }
}

/** Cron: sends every pending card whose send date has arrived. Returns how many went out. */
export async function deliverDueGiftCards(engine: StoredValueEngine, now = new Date()): Promise<number> {
  let sent = 0
  const { docs } = await engine.find({ collection: 'gift-cards', where: { and: [{ status: { equals: 'pending' } }, { sendAt: { less_than_equal: now.toISOString() } }] }, limit: 50, depth: 0, overrideAccess: true })
  for (const card of docs) {
    if (await deliverGiftCard(engine, { ...card, id: Number(card.id) })) sent++
  }
  return sent
}
