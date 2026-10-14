import React from 'react'

import { accountContext } from '@/features/accounts/session'
import { formatCents } from '../../lib/money'
import { loadShopCurrency } from '../../lib/shopCurrency'
import { loadPricedLines } from '../../server/pricing'
import { intervalPhrase, normalisePlan, planProblems, signupFeeCents } from '../plan'
import { subscriptionsOn, stripeSecretFor } from '../gate'
import type { SubEngine } from '../records'
import { SubscriptionOfferBox } from './SubscriptionOfferBox'

/**
 * The Subscribe box on a product page. Shows only when every switch is on: Accounts (subscribers need an
 * account), Subscriptions in Shop settings, Stripe card payments, and a valid plan on this product.
 * Anything missing and the box is simply not there, so a shop that does not use subscriptions is unchanged.
 */
export async function SubscriptionOffer({ product }: { product: { id: number; slug?: string; productType?: string; subscription?: unknown } }) {
  const context = await accountContext()
  if (!context.flags.accounts) return null
  if (product.productType && product.productType !== 'simple' && product.productType !== 'variable') return null
  const plan = normalisePlan(product.subscription)
  if (!plan.enabled || planProblems(plan).length > 0) return null

  const engine = context.engine as unknown as SubEngine
  if (!(await subscriptionsOn(engine))) return null
  if (!(await stripeSecretFor(engine))) return null

  let unitCents: number | undefined
  try {
    const [line] = await loadPricedLines(engine as never, [{ product: product.id, quantity: 1 }])
    unitCents = line?.unitCents
  } catch {
    return null
  }
  if (!unitCents) return null

  const currency = await loadShopCurrency(engine as never)
  const fee = signupFeeCents(plan)
  return (
    <SubscriptionOfferBox
      productId={product.id}
      slug={product.slug ?? ''}
      signedIn={Boolean(context.user)}
      priceText={`${formatCents(unitCents, currency)} ${intervalPhrase(plan.interval, plan.intervalCount)}`}
      trialText={plan.trialDays > 0 ? `First ${plan.trialDays} day${plan.trialDays === 1 ? '' : 's'} free.` : ''}
      feeText={fee > 0 ? `A sign-up fee of ${formatCents(fee, currency)} is added to the first payment.` : ''}
      cancelText={plan.paymentsLimit > 0 ? `Runs for ${plan.paymentsLimit} payment${plan.paymentsLimit === 1 ? '' : 's'}, then ends.` : 'Cancel any time from My subscriptions.'}
    />
  )
}
