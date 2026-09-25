'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `TextInput`.
 *
 * Matches the exact props SlugComponent.tsx already passes:
 * {path, value, readOnly, onChange} with onChange receiving a plain
 * React.ChangeEvent<HTMLInputElement>.
 */

import React from 'react'

export const TextInput: React.FC<{
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  path?: string
  readOnly?: boolean
  value?: string
}> = ({ onChange, path, readOnly, value }) => (
  <input
    className="field-type text"
    id={path}
    name={path}
    onChange={onChange}
    readOnly={readOnly}
    type="text"
    value={value ?? ''}
  />
)

export default TextInput
