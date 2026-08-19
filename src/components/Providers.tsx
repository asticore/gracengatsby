'use client'

import { EcommerceProvider } from '@payloadcms/plugin-ecommerce/client/react'
import { stripeAdapterClient } from '@payloadcms/plugin-ecommerce/payments/stripe'
import React from 'react'

import { AUD } from '@/lib/currencies'

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <EcommerceProvider
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
    </EcommerceProvider>
  )
}
