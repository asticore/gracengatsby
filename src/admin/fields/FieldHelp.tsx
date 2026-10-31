'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useId } from 'react'

import './field-help.css'

/**
 * A small "?" next to a field. Hover or keyboard focus shows the field's `admin.description` as a
 * tooltip. Used by FieldRenderer for every field that has a plain-text description, so a setting's
 * meaning and unit (kg or lb, cm or in, "tax included") are one glance away without cluttering the form.
 */
export const FieldHelp: React.FC<{ text: string }> = ({ text }) => {
  const t = useAdminT()
  const id = useId()
  return (
    <span className="field-help">
      <button type="button" className="field-help__btn" aria-label={t('aria.settingHelp')} aria-describedby={id}>
        ?
      </button>
      <span role="tooltip" id={id} className="field-help__tip">
        {text}
      </span>
    </span>
  )
}
