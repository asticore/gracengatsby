'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `FieldLabel`. Presentational
 * only, except for resolving `label`: field configs type it as Payload's own
 * `StaticLabel` (`string | Record<string, string>`, the latter being a
 * per-locale label map), not a plain ReactNode - so a locale-keyed object is
 * resolved to a single string before rendering.
 */

import React from 'react'

export type StaticLabel = Record<string, string> | string

function resolveLabel(label: StaticLabel | undefined): string | undefined {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') return label.en ?? Object.values(label)[0]
  return undefined
}

export const FieldLabel: React.FC<{
  htmlFor?: string
  label?: StaticLabel
  required?: boolean
}> = ({ htmlFor, label, required }) => {
  const resolved = resolveLabel(label)
  if (!resolved) return null

  return (
    <label className="field-label" htmlFor={htmlFor}>
      {resolved}
      {required && <span className="required">*</span>}
    </label>
  )
}

export default FieldLabel
