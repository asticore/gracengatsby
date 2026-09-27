'use client'

import { EcommerceProvider } from '@/engine/commerce/react'
import React from 'react'

/**
 * `currenciesConfig`/`paymentMethods`/`api`/`syncLocalStorage` used to
 * configure the real `@payloadcms/plugin-ecommerce` provider (`AUD`,
 * `stripeAdapterClient`, `/api` + depth-2 cart fetches, localStorage
 * persistence). Removed 2026-09-27 (payload-removal-plan.md, What's-left
 * item 3): this app's own `EcommerceProvider` (`@/engine/commerce/react`)
 * hardcodes the equivalent behaviour directly - AUD is this shop's only
 * currency, `CheckoutForm.tsx` already loads Stripe itself from
 * `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` via `@stripe/stripe-js` (no separate
 * client-side "payment method" registration needed since `stripe` is the
 * only adapter this app implements), the REST base is always `/api`, cart
 * reads are always depth 2, and localStorage persistence is unconditional.
 */
export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <EcommerceProvider defaultCurrency="AUD">{children}</EcommerceProvider>
}
