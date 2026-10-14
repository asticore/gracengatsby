'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

import { DISPLAY_CURRENCY_COOKIE } from '@/features/ecommerce/lib/displayCurrency'
import { useDisplayCurrencyState } from '@/components/DisplayCurrencyContext'
import './currency-switcher.css'

const YEAR_SECONDS = 31_536_000

/** Lets the shopper pick the currency prices are shown in. Renders nothing until extra currencies are set up. */
export function CurrencySwitcher() {
  const state = useDisplayCurrencyState()
  const router = useRouter()
  if (state.options.length === 0) return null

  const choose = (value: string) => {
    try {
      document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${value}; path=/; max-age=${value ? YEAR_SECONDS : 0}; samesite=lax`
    } catch {
      // Cookies blocked: the choice simply does not stick.
    }
    router.refresh()
  }

  return (
    <div className="currency-switcher">
      <label className="currency-switcher__label" title="Prices in other currencies are approximate. You always pay in the shop currency.">
        <span>Prices in</span>
        <select value={state.selected ?? ''} onChange={(e) => choose(e.target.value)} aria-label="Show prices in">
          <option value="">{state.base} (shop currency)</option>
          {state.options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code} (approx.)
            </option>
          ))}
        </select>
      </label>
      {state.selected ? (
        <p className="currency-switcher__note">
          Converted prices are approximate. You pay in {state.base} at checkout.
        </p>
      ) : null}
    </div>
  )
}
