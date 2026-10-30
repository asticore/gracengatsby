'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

/**
 * Sits above the tracking events table: links to the tag editor, and back to Settings > Tracking. Declared as the
 * collection's admin.components.beforeList panel.
 */
export function TrackingEventsListActions(): React.ReactElement {
  const t = useAdminT()
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
      <AdminLink path="/settings/tracking?tags=open" className="btn btn--style-primary">
        {t('tracking.tags.button')}
      </AdminLink>
      <AdminLink path="/settings/tracking">{t('tracking.tags.backToSettings')}</AdminLink>
    </div>
  )
}
