'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { domainEditorUrl, isMultiDomain, otherDomains, type TrackingDomainInfo } from './domains'

/**
 * On a multi-domain site, says which domain the editor shows and what to do for the others: a link into that
 * domain's own editor when it allows admin access, or the reason it cannot open here. Renders nothing for one domain.
 */
export function DomainNotice({ domains, currentHost, adminRoot }: { domains: TrackingDomainInfo[]; currentHost: string | null; adminRoot: string }): React.ReactElement | null {
  const t = useAdminT()
  if (!isMultiDomain(domains)) return null
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:'
  const others = otherDomains(domains, currentHost)
  return (
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
      <p style={{ margin: '4px 0' }}>{t('tracking.tags.multiDomain.note', { host: currentHost ?? '' })}</p>
      {others.map((domain) => (
        <p key={domain.host} style={{ margin: '4px 0' }}>
          {domain.allowAdmin ? (
            <a href={domainEditorUrl(domain, adminRoot, protocol)}>{t('tracking.tags.multiDomain.open', { domain: domain.host })}</a>
          ) : (
            t('tracking.tags.multiDomain.blocked', { domain: domain.host })
          )}
        </p>
      ))}
    </div>
  )
}
