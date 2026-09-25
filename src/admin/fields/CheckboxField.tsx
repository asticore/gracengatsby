'use client'

import React from 'react'
import { useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel } from './shared'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

export const CheckboxFieldRenderer: React.FC<ScalarFieldRendererProps> = ({ field, path, readOnly }) => {
  const { setValue, value } = useField<boolean>({ path })

  return (
    <div className="field-type checkbox">
      <label htmlFor={`field-${path}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id={`field-${path}`}
          name={path}
          type="checkbox"
          readOnly={readOnly}
          disabled={readOnly}
          checked={Boolean(value)}
          onChange={(e) => setValue(e.target.checked)}
        />
        <span>
          {(() => {
            const label = fieldLabel(field)
            return typeof label === 'string' ? label : label ? Object.values(label)[0] : undefined
          })()}
        </span>
      </label>
    </div>
  )
}
