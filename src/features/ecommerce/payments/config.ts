import { stripeMethodTypes, type PaymentSettingsLike } from '../lib/paymentMethods'

type Doc = Record<string, unknown>
type Engine = { findGlobal: (a: unknown) => Promise<Doc> }

export type LoadedPaymentSettings = PaymentSettingsLike & {
  stripe?: { enabled?: boolean; secretKey?: string; publishableKey?: string } | null
  paypal?: { enabled?: boolean; environment?: string; clientId?: string; clientSecret?: string; webhookId?: string } | null
}

/** The payment-settings global with its secrets decrypted (server only). Empty when it cannot be read. */
export async function loadPaymentSettings(engine: Engine): Promise<LoadedPaymentSettings> {
  try {
    return ((await engine.findGlobal({ slug: 'payment-settings', depth: 0, overrideAccess: true })) ?? {}) as LoadedPaymentSettings
  } catch {
    return {}
  }
}

/** STRIPE_SECRET_KEY wins (it is how the site was first set up); otherwise the key saved in Shop settings > Payments. */
export function resolveStripeSecret(settings: LoadedPaymentSettings): string {
  const env = process.env.STRIPE_SECRET_KEY
  if (env) return env
  const key = settings.stripe?.secretKey
  return typeof key === 'string' ? key.trim() : ''
}

/** Payment method types for a new PaymentIntent, or null for Stripe's automatic choice. */
export function methodTypesFor(settings: LoadedPaymentSettings, amountCents: number, country: string | undefined, currency: string): string[] | null {
  return stripeMethodTypes(settings, { amountCents, country, currency })
}

/** A Stripe `shipping` object from a checkout address; Afterpay and Klarna refuse a PaymentIntent without one. */
export function stripeShipping(address: Record<string, string>): { name: string; address: Record<string, string> } | undefined {
  if (!address.addressLine1 || !address.country) return undefined
  return {
    name: [address.firstName, address.lastName].filter(Boolean).join(' ') || 'Customer',
    address: {
      line1: address.addressLine1,
      ...(address.addressLine2 ? { line2: address.addressLine2 } : {}),
      city: address.city ?? '',
      state: address.state ?? '',
      postal_code: address.postalCode ?? '',
      country: address.country.toUpperCase().slice(0, 2),
    },
  }
}
