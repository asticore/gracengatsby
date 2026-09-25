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

const SingleSelect: React.FC<{ field: Field; path: string; readOnly?: boolean; options: Option[] }> = ({ field, path, readOnly, options }) => {
  const { setValue, value } = useField<string>({ path })

  return (
    <div className="field-type select">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <select
        id={`field-${path}`}
        disabled={readOnly}
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">— Select —</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

const MultiSelect: React.FC<{ field: Field; path: string; readOnly?: boolean; options: Option[] }> = ({ field, path, readOnly, options }) => {
  const { setValue, value } = useField<string[]>({ path })

  return (
    <div className="field-type select">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <select
        id={`field-${path}`}
        multiple
        disabled={readOnly}
        value={value || []}
        onChange={(e) => {
          setValue(Array.from(e.target.selectedOptions).map((o) => o.value))
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

export const SelectFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const rawOptions = (field as { options?: Array<Option | string> }).options ?? []
  const options: Option[] = rawOptions.map((opt) => (typeof opt === 'string' ? { label: opt, value: opt } : opt))
  const hasMany = Boolean((field as { hasMany?: boolean }).hasMany)

  if (hasMany) {
    return <MultiSelect field={field} path={path} readOnly={readOnly} options={options} />
  }

  return <SingleSelect field={field} path={path} readOnly={readOnly} options={options} />
}
