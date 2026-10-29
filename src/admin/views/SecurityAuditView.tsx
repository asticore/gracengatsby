import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess, isAdminUser } from '@/admin/auth'
import { AUTH_AUDIT_ACTIONS } from '@/features/security/auditLog'
import { auditPageHref, parseAuditFilter } from '@/features/security/auditQuery'
import { listAuthAuditPage } from '@/features/security/auditStore'

/**
 * /admin/security/audit. Every account-security event, newest first, filtered
 * by action or by account. Administrators only: the rows name who signed in
 * and from where, and the audit collection is closed to everyone else too.
 */
export async function SecurityAuditView({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))

  if (!isAdminUser(context.user)) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>Only an administrator can see the security audit log.</p>
      </div>
    )
  }

  const filter = parseAuditFilter(searchParams ?? {})
  const page = await listAuthAuditPage(filter).catch((): null => null)

  return (
    <div style={{ maxWidth: 1120, padding: '1.5rem' }}>
      <h1>Security audit</h1>
      <p>Sign-ins, failed attempts, lockouts, password and email changes, two-step sign-in, passkeys, API keys, connected accounts, sessions and impersonation. Newest first.</p>

      <form method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', margin: '1rem 0' }}>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>Event</span>
          <select name="action" defaultValue={filter.action ?? ''}>
            <option value="">All events</option>
            {AUTH_AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>Account (email or ID)</span>
          <input type="text" name="user" defaultValue={filter.user ?? ''} maxLength={255} />
        </label>
        <button type="submit">Filter</button>
      </form>

      {page === null ? (
        <p role="alert">The audit log could not be loaded just now.</p>
      ) : page.rows.length === 0 ? (
        <p>No events match.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">When (UTC)</th>
                <th scope="col">Event</th>
                <th scope="col">Account</th>
                <th scope="col">Item</th>
                <th scope="col">Detail</th>
                <th scope="col">Address</th>
                <th scope="col">Browser</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt.replace('T', ' ').slice(0, 19)}</td>
                  <td><code>{row.action}</code></td>
                  <td>{row.actorEmail ?? (row.actorId !== null ? `#${row.actorId}` : '-')}</td>
                  <td>{[row.collectionSlug, row.documentId].filter(Boolean).join(' ') || '-'}</td>
                  <td>{row.detail ?? '-'}</td>
                  <td>{row.ip ?? '-'}</td>
                  <td>{row.userAgent ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page ? (
        <nav aria-label="Pages" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          {filter.page > 1 ? <a href={auditPageHref(filter, filter.page - 1)}>Newer</a> : null}
          <span>Page {filter.page}</span>
          {page.hasNext ? <a href={auditPageHref(filter, filter.page + 1)}>Older</a> : null}
        </nav>
      ) : null}
    </div>
  )
}
