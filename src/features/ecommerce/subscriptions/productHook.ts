import { loadShopCurrency } from '../lib/shopCurrency'
import { loadPricedLines } from '../server/pricing'
import { getStripeClient } from '../payments/stripeAdapter'
import { normalisePlan, planProblems, signupFeeCents } from './plan'
import { subscriptionsOn, stripeSecretFor } from './gate'
import { ensureFeePrice, ensureRecurringPrice } from './stripe'
import { SUBSCRIPTION_CURRENCY_MINIMUM_CENTS } from './start'
import type { SubEngine } from './records'

/**
 * afterChange on Products: when a subscription plan is saved, its Stripe prices are created now, so a
 * problem shows at save time rather than at the first customer's checkout. The same prices are also
 * created on demand at checkout (a sale that starts later changes the amount), so this never has to
 * succeed for a sale to work. Never throws: a Stripe problem must not fail the product save.
 */
export async function runSubscriptionAfterChange({ doc, req }: { doc: Record<string, unknown>; req: { engine: unknown } }): Promise<Record<string, unknown>> {
  try {
    const plan = normalisePlan(doc.subscription)
    if (!plan.enabled || planProblems(plan).length > 0) return doc
    if (doc.productType === 'giftcard' || doc.productType === 'external' || doc.productType === 'grouped') return doc
    const engine = req.engine as unknown as SubEngine
    if (!(await subscriptionsOn(engine))) return doc
    const secret = await stripeSecretFor(engine)
    if (!secret) return doc
    const id = Number(doc.id)
    const [line] = await loadPricedLines(engine as never, [{ product: id, quantity: 1 }]).catch((): [] => [])
    if (!line || line.unitCents < SUBSCRIPTION_CURRENCY_MINIMUM_CENTS) return doc
    const currency = (await loadShopCurrency(engine as never)).toLowerCase()
    const stripe = getStripeClient(secret)
    const title = String(doc.title ?? 'Subscription')
    await ensureRecurringPrice(stripe, { productId: id, title, currency, amountCents: line.unitCents, interval: plan.interval, intervalCount: plan.intervalCount })
    const feeCents = signupFeeCents(plan)
    if (feeCents > 0) await ensureFeePrice(stripe, { productId: id, title, currency, feeCents })
  } catch (error) {
    console.error(`Subscription prices could not be set up in Stripe for product ${String(doc.id)}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return doc
}
