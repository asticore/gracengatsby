'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

/** Points to the Integrations page where email and text keys are entered. */
export function EmailConnectionNote() {
  const t = useAdminT()
  return (
    <p className="et-muted">
      {t('integrations.email.note')}{' '}
      <AdminLink path="/settings/site#integrations">{t('integrations.pageLink')}</AdminLink>.
    </p>
  )
}
