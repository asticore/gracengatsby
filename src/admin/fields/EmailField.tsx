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

export const EmailFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<string>({ path })

  return (
    <div className="field-type email">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <input
        id={`field-${path}`}
        name={path}
        type="email"
        readOnly={readOnly}
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  )
}
