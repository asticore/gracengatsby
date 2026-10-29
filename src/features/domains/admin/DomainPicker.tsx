'use client'

import React, { useEffect, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { useField } from '@/engine/ui'
import { parseHostList } from '@/features/domains/scope'

type Listed = { host: string; status?: string; isPrimary?: boolean }

/**
 * Checkboxes for the registered domains, for "Available on domains" and "Allowed domains". Reads the list from
 * /api/admin-domain-list and writes the same delimited value the field always stored (",a.com,b.com,"), or null for
 * none. A host that is stored but no longer registered is kept as it was, so editing never silently drops it.
 */
export function DomainPicker({ path }: { path: string }) {
  const field = useField<string | null>({ path })
  const t = useAdminT()
  const [domains, setDomains] = useState<Listed[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin-domain-list', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { domains?: Listed[] } | null) => {
        if (alive) setDomains(json?.domains ?? [])
      })
      .catch(() => {
        if (alive) setDomains([])
      })
    return () => {
      alive = false
    }
  }, [])

  const selected = parseHostList(field.value)

  const toggle = (host: string, on: boolean) => {
    const next = on ? [...selected.filter((h) => h !== host), host] : selected.filter((h) => h !== host)
    field.setValue(next.length > 0 ? `,${next.join(',')},` : null)
  }

  // On "Available on domains" (not "Allowed domains") a single host makes the content site-specific: the same slug
  // can then live on another domain. Nothing ticked is the shared default, shown on every domain.
  const siteLine = path === 'allowedDomains' ? null : selected.length === 0 ? t('domains.site.shared') : t('domains.site.scoped', { domains: selected.join(', ') })

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {siteLine && <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.8 }}>{siteLine}</p>}
      {(domains ?? []).map((domain) => (
        <label key={domain.host} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={selected.includes(domain.host)} onChange={(event) => toggle(domain.host, event.target.checked)} />
          <span>{domain.host}</span>
        </label>
      ))}
    </div>
  )
}

export default DomainPicker
