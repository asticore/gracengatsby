import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { listEmbeddableForms } from '@/features/forms/embedActions'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { getAdminUi } from '@/admin/i18n/serverUi'

import { ExternalEmbedsPanel, NewEmbedForm } from './ExternalEmbedsPanel'

/** /admin/external-embeds. Forms read permission to see it; the Forms integrations permission (or admin) to change it. */
export async function ExternalEmbedsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const ui = await getAdminUi()
  const result = await listEmbeddableForms()
  return (
    <div className="list-view" style={{ maxWidth: 900, padding: '1.5rem' }}>
      <h1>{ui.t('extEmbeds.title')}</h1>
      {'error' in result ? (
        <p role="status">{result.error}</p>
      ) : (
        <>
          <NewEmbedForm rows={result.rows} />
          <ExternalEmbedsPanel rows={result.rows} canChange={result.canChange} />
        </>
      )}
    </div>
  )
}
