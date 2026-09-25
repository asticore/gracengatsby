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

export const DateFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<string>({ path })

  return (
    <div className="field-type date">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <input
        id={`field-${path}`}
        type="date"
        readOnly={readOnly}
        value={value ? value.slice(0, 10) : ''}
        onChange={(e) => {
          const raw = e.target.value
          if (!raw) {
            setValue(undefined as unknown as string)
            return
          }
          const iso = new Date(raw).toISOString()
          setValue(iso)
        }}
      />
    </div>
  )
}
