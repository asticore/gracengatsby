'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * `admin.components.Field` stand-in for Products' `priceInAUD` field
 * (`../collections/Products.ts`), resolved via the EXISTING generic
 * `admin.components.Field` mechanism (`@/admin/componentRegistry.ts` +
 * `@/admin/fields/FieldRenderer.tsx`'s `SingleFieldRenderer`) - no new
 * machinery needed here, unlike the Cell side (`@/admin/cellRegistry.ts`).
 *
 * Deliberately a purely COSMETIC wrapper around the same plain number input
 * `NumberFieldRenderer` already renders (`@/admin/fields/NumberField.tsx`) -
 * a `$` prefix and a 0.01 step, nothing else. It does NOT convert the typed
 * value (no `* 100`/`/ 100`) - correctly so: `priceInAUD` is stored in WHOLE
 * currency units (e.g. `29.99` meaning $29.99), confirmed 2026-09-26 after a
 * dedicated investigation (see the plan doc's What's-left item #12 and
 * incident log) that also fixed the several storefront/admin call sites that
 * were WRONGLY treating this field as cents (`formatCurrency`,
 * `formatPriceCell`, `mergeTags.ts`/`LoopBlock.tsx`, and a real-Stripe-amount
 * bug in `stripeAdapter.ts`). This input needed no change - a plain 1:1
 * dollars-in-dollars-out number field was already correct.
 */
export function PriceInput({ field, path, readOnly }: ScalarFieldRendererProps) {
  const { setValue, value } = useField<number | undefined>({ path })
  const min = (field as { min?: number }).min
  const max = (field as { max?: number }).max

  return (
    <div className="field-type number">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <div style={{ alignItems: 'center', display: 'flex', gap: 4 }}>
        <span aria-hidden style={{ opacity: 0.7 }}>
          $
        </span>
        <input
          id={`field-${path}`}
          name={path}
          type="number"
          step="0.01"
          readOnly={readOnly}
          value={value ?? ''}
          min={min}
          max={max}
          onChange={(e) => {
            const raw = e.target.valueAsNumber
            setValue(Number.isNaN(raw) ? undefined : raw)
          }}
        />
      </div>
    </div>
  )
}
