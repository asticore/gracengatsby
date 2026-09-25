'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from './shared'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

export const NumberFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<number | undefined>({ path })
  const min = (field as { min?: number }).min
  const max = (field as { max?: number }).max

  return (
    <div className="field-type number">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <input
        id={`field-${path}`}
        name={path}
        type="number"
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
  )
}
