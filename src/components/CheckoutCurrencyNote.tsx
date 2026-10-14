'use client'

import React from 'react'

import { useDisplayCurrencyState } from '@/components/DisplayCurrencyContext'

/** Shown above checkout when other currencies are on offer: the charge is always in the shop currency. */
export function CheckoutCurrencyNote() {
  const state = useDisplayCurrencyState()
  if (state.options.length === 0) return null
  return (
    <p className="checkout-currency-note" role="note">
      You will be charged in {state.base}. Any prices shown in other currencies are approximate and are not what you pay.
    </p>
  )
}
