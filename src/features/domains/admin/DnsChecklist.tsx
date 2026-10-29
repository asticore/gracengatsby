'use client'

import React, { useEffect, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { dnsChecklistFor, dnsHintFor, type ChecklistDomain } from '@/features/domains/checklist'

/**
 * The per-domain DNS and Worker hints, with the full checklist as text that can be selected and copied. Nothing is
 * checked against Cloudflare; the hint says so on each row.
 */
export function DnsChecklist() {
  const [domains, setDomains] = useState<ChecklistDomain[] | null>(null)
  const t = useAdminT()

  useEffect(() => {
    let alive = true
    fetch('/api/admin-domain-list', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { domains?: ChecklistDomain[] } | null) => {
        if (alive) setDomains(json?.domains ?? [])
      })
      .catch(() => {
        if (alive) setDomains([])
      })
    return () => {
      alive = false
    }
  }, [])

  const list = domains ?? []
  const text = dnsChecklistFor(list, t)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {list.map((domain) => (
        <div key={domain.host} style={{ display: 'grid', gap: 2 }}>
          <strong>{domain.host}</strong>
          <span style={{ opacity: 0.8 }}>{dnsHintFor(domain, t)}</span>
        </div>
      ))}
      <textarea readOnly rows={Math.min(16, text.split('\n').length + 1)} value={text} onFocus={(event) => event.target.select()} style={{ width: '100%', fontFamily: 'monospace' }} />
    </div>
  )
}

export default DnsChecklist
