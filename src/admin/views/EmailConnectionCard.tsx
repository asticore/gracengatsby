import React from 'react'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { EmailConnectionNote } from './EmailConnectionNote'
import { connectionHeadline } from '@/features/email/connectionRead'
import type { ProviderState, ProviderStateSummary } from '@/features/email/providerState'

/** "Is email connected?" - one row per provider, with its default or fallback role. */

function roleOf(provider: ProviderState): UiStringKey | '' {
  if (provider.isDefault) return 'ig.lit.conn_default'
  if (provider.isFallback) return 'ig.lit.conn_fallback'
  return ''
}

function ProviderRow({ provider }: { provider: ProviderState }) {
  const t = useAdminT()
  const role = roleOf(provider)
  return (
    <tr>
      <td>{provider.label}</td>
      <td>
        <span className={provider.connected ? 'et-badge et-badge--good' : 'et-badge et-badge--missing'}>
          {provider.connected ? t('ig.lit.conn_connected') : t('ig.lit.conn_not_connected')}
        </span>
        {!provider.connected && provider.missing.length > 0 && (
          <span className="et-muted"> {t('ig.lit.missing', { list: provider.missing.join(', ') })}</span>
        )}
      </td>
      <td>{role ? t(role) : <span className="et-muted">-</span>}</td>
    </tr>
  )
}

export function EmailConnectionCard({ summary }: { summary: ProviderStateSummary }) {
  const t = useAdminT()
  return (
    <CollapsibleCard id="email-testing-connections" title={t('ig.lit.conn_title')}>
      <p className="et-headline">{connectionHeadline(summary)}</p>
      <table className="et-table">
        <thead>
          <tr>
            <th scope="col">{t('ig.lit.col_provider')}</th>
            <th scope="col">{t('ig.lit.col_status')}</th>
            <th scope="col">{t('ig.lit.col_role')}</th>
          </tr>
        </thead>
        <tbody>
          {summary.providers.map((provider) => (
            <ProviderRow key={provider.key} provider={provider} />
          ))}
        </tbody>
      </table>
      <EmailConnectionNote />
    </CollapsibleCard>
  )
}
