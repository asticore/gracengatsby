import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess, isAdminUser } from '@/admin/auth'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { AUTH_AUDIT_ACTIONS } from '@/features/security/auditLog'
import { auditPageHref, parseAuditFilter } from '@/features/security/auditQuery'
import { listAuthAuditPage } from '@/features/security/auditStore'
import { SortableTable } from '@/admin/table/SortableTable'

/**
 * /admin/security/audit. Every account-security event, newest first, filtered
 * by action or by account. Administrators only: the rows name who signed in
 * and from where, and the audit collection is closed to everyone else too.
 */
export async function SecurityAuditView({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const ui = await getAdminUi()

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
        <p role="alert">{ui.t('audit.loadFailed')}</p>
      ) : page.rows.length === 0 ? (
        <p>{ui.t('audit.noMatch')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <SortableTable
            columns={[
              { key: 'when', label: 'When (UTC)' },
              { key: 'event', label: 'Event' },
              { key: 'account', label: 'Account' },
              { key: 'item', label: 'Item' },
              { key: 'detail', label: 'Detail' },
              { key: 'address', label: 'Address' },
              { key: 'browser', label: 'Browser' },
            ]}
            caption={ui.t('table.sortPageOnly')}
            rows={page.rows.map((row) => {
              const account = row.actorEmail ?? (row.actorId !== null ? `#${row.actorId}` : '-')
              const item = [row.collectionSlug, row.documentId].filter(Boolean).join(' ') || '-'
              return {
                id: String(row.id),
                sortValues: {
                  when: row.createdAt,
                  event: row.action,
                  account,
                  item,
                  detail: row.detail ?? '-',
                  address: row.ip ?? '-',
                  browser: row.userAgent ?? '-',
                },
                cells: {
                  when: row.createdAt.replace('T', ' ').slice(0, 19),
                  event: <code>{row.action}</code>,
                  account,
                  item,
                  detail: row.detail ?? '-',
                  address: row.ip ?? '-',
                  browser: row.userAgent ?? '-',
                },
              }
            })}
          />
        </div>
      )}

      {page ? (
        <nav aria-label={ui.t('aria.pages')} style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          {filter.page > 1 ? <a href={auditPageHref(filter, filter.page - 1)}>Newer</a> : null}
          <span>Page {filter.page}</span>
          {page.hasNext ? <a href={auditPageHref(filter, filter.page + 1)}>Older</a> : null}
        </nav>
      ) : null}
    </div>
  )
}
