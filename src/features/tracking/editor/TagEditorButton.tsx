'use client'

import { useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { TagEditor } from './TagEditor'

/** The prominent "Add tags" button on Settings > Tracking. Opens the full-screen visual tag editor. */
export function TagEditorButton(): React.ReactElement {
  const t = useAdminT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn--style-primary" onClick={() => setOpen(true)}>
        {t('tracking.tags.button')}
      </button>
      {open ? <TagEditor onClose={() => setOpen(false)} /> : null}
    </>
  )
}
