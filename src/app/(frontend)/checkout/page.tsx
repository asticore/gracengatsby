import React from 'react'

import { CheckoutForm } from '@/components/CheckoutForm'
import { CheckoutCurrencyNote } from '@/components/CheckoutCurrencyNote'

export const metadata = {
  title: 'Checkout | Grace & Gatsby',
}

export default function CheckoutPage() {
  return (
    <div className="page-shell checkout-page">
      <h1>Checkout</h1>
      <CheckoutCurrencyNote />
      <CheckoutForm />
    </div>
  )
}
