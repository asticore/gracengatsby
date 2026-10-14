import { loadPaymentSettings, resolveStripeSecret } from '../payments/config'

/**
 * The two switches a subscription needs before anything is sold: Subscriptions on in Shop settings
 * (a column on the shop-extra-settings global) and Stripe card payments switched on with a key.
 * Read on every request, and a read that fails counts as off, so nothing is sold by accident.
 */

type Engine = { findGlobal(args: Record<string, unknown>): Promise<unknown> }

export async function subscriptionsOn(engine: Engine): Promise<boolean> {
  try {
    const doc = (await engine.findGlobal({ slug: 'shop-extra-settings', depth: 0, overrideAccess: true })) as { subscriptionsEnabled?: unknown } | null
    return doc?.subscriptionsEnabled === true
  } catch {
    return false
  }
}

/** The Stripe secret key when Stripe is switched on, otherwise an empty string. Server only. */
export async function stripeSecretFor(engine: Engine): Promise<string> {
  const settings = await loadPaymentSettings(engine as never)
  if (settings.stripe?.enabled !== true) return ''
  return resolveStripeSecret(settings)
}
