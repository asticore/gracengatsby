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

export const TextareaFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<string>({ path })
  const rows = (field as { admin?: { rows?: number } }).admin?.rows ?? 4

  return (
    <div className="field-type textarea">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <textarea
        id={`field-${path}`}
        readOnly={readOnly}
        rows={rows}
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  )
}
