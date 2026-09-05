'use client'

import { ShopProvider } from '@/engine/commerce/react'
import { stripeAdapterClient } from '@/engine/commerce/stripe'
import React from 'react'

import { AUD } from '@/lib/currencies'

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ShopProvider
      currenciesConfig={{
        defaultCurrency: 'AUD',
        supportedCurrencies: [AUD],
      }}
      paymentMethods={[
        stripeAdapterClient({
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
        }),
      ]}
      api={{
        apiRoute: '/api',
        cartsFetchQuery: {
          depth: 2,
        },
      }}
      syncLocalStorage
    >
      {children}
    </ShopProvider>
  )
}
