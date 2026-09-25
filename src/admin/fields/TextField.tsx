'use client'

import React from 'react'
import { FieldLabel, TextInput, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from './shared'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

export const TextFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<string>({ path })

  return (
    <div className="field-type text">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <TextInput
        path={path}
        value={value || ''}
        readOnly={readOnly}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setValue(e.target.value)
        }}
      />
    </div>
  )
}
