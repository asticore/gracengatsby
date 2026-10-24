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
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!isAdminUser(context.user)) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>Only an administrator can see organizations.</p>
      </div>
    )
  }

  const { deps, admin } = await adminRuntime()
  const result = await adminListOrganizations(deps, admin)
  const orgs = result.value ?? []

  return (
    <div style={{ maxWidth: 1040, padding: '1.5rem' }}>
      <h1>Organizations</h1>
      <p>
        Customer organizations are {deps.settings.enabled ? 'switched on' : 'switched off'} in Settings &gt; Security. Deleting one removes its members, teams, invitations and any content limits that name it.{' '}
        <Link href="/admin/security/audit">See the audit log</Link>.
      </p>
      {result.ok ? null : <p role="alert">{result.message}</p>}
      {orgs.length === 0 ? (
        <p>No organizations yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Address name</th>
              <th align="right">Members</th>
              <th align="left">Created</th>
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
