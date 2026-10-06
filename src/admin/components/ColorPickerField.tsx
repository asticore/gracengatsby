'use client'

import React, { useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'

type ColorPickerFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * Color picker field with both a native color input and text input.
 * Maintains sync between both inputs and validates hex color format.
 */
export function ColorPickerField({ field, path, readOnly }: ColorPickerFieldProps) {
  const { value, setValue } = useField<string | undefined | null>({ path })
  const [isValid, setIsValid] = useState(true)

  const normalizedValue = (typeof value === 'string' ? value : '').trim()

  const validateHex = (hex: string): boolean => {
    if (!hex) return true // Allow empty
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)
  }

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    setIsValid(validateHex(newValue))
  }

  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.trim()
    if (newValue === '') {
      setValue(null)
      setIsValid(true)
    } else {
      setValue(newValue)
      setIsValid(validateHex(newValue))
    }
  }

  // Convert hex to color input format (needs to be valid hex for color input)
  const colorInputValue = validateHex(normalizedValue) ? normalizedValue : '#000000'

  return (
    <div className="field-type">
      <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="color"
          value={colorInputValue}
          onChange={handleColorInputChange}
          disabled={readOnly}
          style={{
            width: '60px',
            height: '40px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: readOnly ? 'not-allowed' : 'pointer',
          }}
        />

        <input
          id={`field-${path}`}
          type="text"
          value={normalizedValue}
          onChange={handleTextInputChange}
          placeholder="#000000"
          disabled={readOnly}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: isValid ? '1px solid #ccc' : '1px solid #b3261e',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '13px',
            cursor: readOnly ? 'not-allowed' : 'text',
          }}
        />
      </div>

      {!isValid && (
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b3261e' }}>
          Enter a valid hex color, e.g. #000000 or #fff
        </p>
      )}

      {field.admin?.description && (
        <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.7 }}>
          {String(field.admin.description)}
        </p>
      )}
    </div>
  )
}