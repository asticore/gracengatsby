'use client'

import Link from 'next/link'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

/** Points to the Integrations page where email and text keys are entered. */
export function EmailConnectionNote() {
  const t = useAdminT()
  return (
    <p className="et-muted">
      {t('integrations.email.note')}{' '}
      <Link href="/admin/settings/site#integrations">{t('integrations.pageLink')}</Link>.
    </p>
  )
}
