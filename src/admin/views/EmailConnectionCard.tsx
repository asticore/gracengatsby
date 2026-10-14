import React from 'react'
import Link from 'next/link'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { connectionHeadline } from '@/features/email/connectionRead'
import type { ProviderState, ProviderStateSummary } from '@/features/email/providerState'

/** "Is email connected?" - one row per provider, with its default or fallback role. */

function roleOf(provider: ProviderState): string {
  if (provider.isDefault) return 'Default'
  if (provider.isFallback) return 'Fallback'
  return ''
}

function ProviderRow({ provider }: { provider: ProviderState }) {
  const role = roleOf(provider)
  return (
    <tr>
      <td>{provider.label}</td>
      <td>
        <span className={provider.connected ? 'et-badge et-badge--good' : 'et-badge et-badge--missing'}>
          {provider.connected ? 'Connected' : 'Not connected'}
        </span>
        {!provider.connected && provider.missing.length > 0 && (
          <span className="et-muted"> Missing: {provider.missing.join(', ')}</span>
        )}
      </td>
      <td>{role || <span className="et-muted">-</span>}</td>
    </tr>
  )
}

export function EmailConnectionCard({ summary }: { summary: ProviderStateSummary }) {
  return (
    <CollapsibleCard id="email-testing-connections" title="Is email connected?">
      <p className="et-headline">{connectionHeadline(summary)}</p>
      <table className="et-table">
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Status</th>
            <th scope="col">Role</th>
          </tr>
        </thead>
        <tbody>
          {summary.providers.map((provider) => (
            <ProviderRow key={provider.key} provider={provider} />
          ))}
        </tbody>
      </table>
      <p className="et-muted">
        Keys are never shown here. To add or change one, open the Integrations page:{' '}
        <Link href="/admin/settings/site#integrations">Integrations</Link>.
      </p>
    </CollapsibleCard>
  )
}
