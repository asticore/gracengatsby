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

type Option = { label: string; value: string }

export const RadioFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<string>({ path })
  const rawOptions = (field as { options?: Array<Option | string> }).options ?? []
  const options: Option[] = rawOptions.map((opt) => (typeof opt === 'string' ? { label: opt, value: opt } : opt))

  return (
    <div className="field-type radio">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <div>
        {options.map((opt) => (
          <label key={opt.value} style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="radio"
              name={path}
              value={opt.value}
              checked={value === opt.value}
              disabled={readOnly}
              onChange={() => setValue(opt.value)}
            />
            {' '}{opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}
