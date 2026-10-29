'use client'

import React, { useEffect, useState } from 'react'

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

  return (
    <div style={{ display: 'grid', gap: 6 }}>
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
