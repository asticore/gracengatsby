import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { getAdminUi } from '@/admin/i18n/serverUi'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess, isAdminUser } from '@/admin/auth'
import { AdminDeleteOrganizationForm } from '@/features/organizations/components/OrganizationForms'
import { adminListOrganizations } from '@/features/organizations/service'
import { adminRuntime } from '@/features/organizations/wiring'

/**
 * /admin/security/organizations. Every customer organisation with its member
 * count, and a delete button. Administrators only; the delete action checks
 * again on the server and writes an audit entry (see /security/audit).
 */
export async function OrganizationsView() {
  const context = await getAdminContext()
  const ui = await getAdminUi()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  if (!isAdminUser(context.user)) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>{ui.t('cu.lit.only_admin_orgs')}</p>
      </div>
    )
  }

  const { deps, admin } = await adminRuntime()
  const result = await adminListOrganizations(deps, admin)
  const orgs = result.value ?? []

  return (
    <div style={{ maxWidth: 1040, padding: '1.5rem' }}>
      <h1>{ui.t('cu.lit.organizations')}</h1>
      <p>
        {ui.t('cu.lit.orgs_intro', { state: deps.settings.enabled ? ui.t('cu.lit.switched_on') : ui.t('cu.lit.switched_off') })}{' '}
        <Link href="/admin/security/audit">{ui.t('cu.lit.see_audit_log')}</Link>.
      </p>
      {result.ok ? null : <p role="alert">{result.message}</p>}
      {orgs.length === 0 ? (
        <p>{ui.t('cu.lit.no_orgs_yet')}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">{ui.t('cu.lit.col_name')}</th>
              <th align="left">{ui.t('cu.lit.col_address_name')}</th>
              <th align="right">{ui.t('cu.lit.col_members')}</th>
              <th align="left">{ui.t('cu.lit.col_created')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>{org.slug}</td>
                <td align="right">{org.memberCount}</td>
                <td>{org.createdAt.slice(0, 10)}</td>
                <td align="right">
                  <AdminDeleteOrganizationForm organizationId={org.id} name={org.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
