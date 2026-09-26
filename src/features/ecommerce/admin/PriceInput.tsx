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
 * value (no `* 100`/`/ 100`): `priceInAUD`'s stored-value unit convention
 * turned out to be genuinely ambiguous across this codebase while scoping
 * this task (`formatCurrency` divides by 100 as if storing cents;
 * `pricing.ts`'s own doc comment and `cms-db-products.int.spec.ts`'s fixture
 * (`priceInAUD: 29.99`) both treat it as whole currency units; `stripeAdapter.ts`
 * passes `cart.subtotal` - built directly from `priceInAUD` - straight to
 * Stripe's `amount` with no `* 100` either). Adding a conversion here without
 * resolving that ambiguity first would risk silently corrupting a real money
 * field on save. See the plan doc's incident log for this finding - flagged
 * for a dedicated look, not fixed as a drive-by inside this cosmetic task.
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
