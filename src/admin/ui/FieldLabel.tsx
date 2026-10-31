'use client'

/**
 * From-scratch replacement for `the vendor package`'s `FieldLabel`. Presentational
 * only, except for resolving `label`: field configs type it as the original engine's own
 * `StaticLabel` (`string | Record<string, string>`, the latter being a
 * per-locale label map), not a plain ReactNode - so a locale-keyed object is
 * resolved to a single string before rendering.
 */

import React from 'react'

import { useAdminFieldLabel } from '@/admin/i18n/AdminUiProvider'

export type StaticLabel = Record<string, string> | string

function resolveLabel(label: StaticLabel | undefined): string | undefined {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') return label.en ?? Object.values(label)[0]
  return undefined
}

export const FieldLabel: React.FC<{
  htmlFor?: string
  label?: StaticLabel
  /** The field's name in the config. Its label is translated when the reference table has one. */
  name?: string
  /** The field's path in the config (`metaPixel.enabled`). A label keyed by this path wins over `name`. */
  path?: string
  required?: boolean
}> = ({ htmlFor, label, name, path, required }) => {
  const fieldLabelFor = useAdminFieldLabel()
  const configLabel = resolveLabel(label)
  const resolved = configLabel && name ? fieldLabelFor(path, name, configLabel) : configLabel
  if (!resolved) return null

  return (
    <label className="field-label" htmlFor={htmlFor}>
      {resolved}
      {required && <span className="required">*</span>}
    </label>
  )
}

export default FieldLabel
