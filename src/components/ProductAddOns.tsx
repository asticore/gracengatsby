'use client'

import React from 'react'

import { useShopCurrency } from '@/components/ShopCurrencyContext'
import type { AddOnView } from '@/features/ecommerce/lib/addOns'
import { formatPriceInAUD } from '@/lib/formatCurrency'

export type AddOnValues = Record<string, string | boolean>

/**
 * The questions a product asks before it can be added to the cart (see lib/addOns.ts). The browser only
 * collects the answers; the server checks them against the product and prices them.
 */
export function ProductAddOns({ defs, values, onChange }: { defs: AddOnView[]; values: AddOnValues; onChange: (id: string, value: string | boolean) => void }) {
  const currency = useShopCurrency()
  if (defs.length === 0) return null
  return (
    <div className="mb-4 mt-2">
      {defs.map((def) => {
        const id = `add-on-${def.id}`
        const hint =
          def.priceCents > 0
            ? `Adds ${formatPriceInAUD(def.priceCents / 100, currency)}${def.priceMode === 'perCharacter' ? ' per character' : ''}`
            : null
        const label = (
          <span className="mb-1 block text-[0.8rem] uppercase tracking-[0.06em]">
            {def.label}
            {def.required ? ' (required)' : ''}
          </span>
        )
        if (def.inputType === 'checkbox') {
          return (
            <div key={def.id} className="mb-3">
              <label htmlFor={id} className="flex items-start gap-2">
                <input id={id} type="checkbox" className="mt-1" checked={values[def.id] === true} onChange={(event) => onChange(def.id, event.target.checked)} />
                <span>
                  {def.label}
                  {def.required ? ' (required)' : ''}
                  {hint ? <span className="block text-[0.85rem] opacity-70">{hint}</span> : null}
                  {def.description ? <span className="block text-[0.85rem] opacity-70">{def.description}</span> : null}
                </span>
              </label>
            </div>
          )
        }
        const text = typeof values[def.id] === 'string' ? (values[def.id] as string) : ''
        return (
          <label key={def.id} htmlFor={id} className="mb-3 block">
            {label}
            {def.inputType === 'select' ? (
              <select id={id} className="w-full border border-[var(--color-line)] p-2" value={text} onChange={(event) => onChange(def.id, event.target.value)}>
                <option value="">{def.required ? 'Choose one' : 'None'}</option>
                {def.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : def.inputType === 'textarea' ? (
              <textarea id={id} className="w-full border border-[var(--color-line)] p-2" rows={3} maxLength={def.maxLength} value={text} onChange={(event) => onChange(def.id, event.target.value)} />
            ) : (
              <input id={id} type="text" className="w-full border border-[var(--color-line)] p-2" maxLength={def.maxLength} value={text} onChange={(event) => onChange(def.id, event.target.value)} />
            )}
            {def.description ? <span className="mt-1 block text-[0.85rem] opacity-70">{def.description}</span> : null}
            {hint ? <span className="mt-1 block text-[0.85rem] opacity-70">{hint}</span> : null}
          </label>
        )
      })}
    </div>
  )
}
