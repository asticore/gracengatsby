'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React from 'react'
import { collapseAll, expandAll } from './collapseStore'
import './edit-collapse.css'

/** Two small buttons that fold or unfold every registered option card at once. */
export function CollapseAllBar() {
  const t = useAdminT()
  return (
    <div className="ec-collapse-bar" role="group" aria-label={t('aria.optionCards')}>
      <button type="button" className="ec-collapse-bar__button" onClick={() => collapseAll()}>
        Collapse all
      </button>
      <button type="button" className="ec-collapse-bar__button" onClick={() => expandAll()}>
        Expand all
      </button>
    </div>
  )
}

export default CollapseAllBar
