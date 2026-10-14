'use client'

import React, { useEffect, useState } from 'react'

import type { ProviderStateSummary } from '../providerState'

/**
 * Lists each email provider as connected or not, with the default and fallback
 * marked. Reads the saved settings from the server, so it shows what is
 * actually connected rather than what is typed into the form. It never shows a
 * key.
 */
export const ConnectionStatus: React.FC = () => {
  const [summary, setSummary] = useState<ProviderStateSummary | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/admin-email-connections', { credentials: 'include' })
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as ProviderStateSummary
        if (!cancelled) setSummary(body)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) {
    return <p style={{ fontSize: 13, margin: '0 0 16px' }}>Connection status could not be loaded. Try again after saving.</p>
  }
  if (!summary) {
    return <p style={{ fontSize: 13, margin: '0 0 16px', opacity: 0.75 }}>Checking connections...</p>
  }

  return (
    <div style={{ margin: '0 0 20px' }}>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        {summary.emailConnected
          ? `Email is connected through ${summary.defaultLabel}.`
          : 'Email is not connected yet. Choose a default provider and save its key.'}
        {summary.fallbackLabel ? ` Fallback: ${summary.fallbackLabel}.` : ''}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, lineHeight: 1.7 }}>
        {summary.providers.map((provider) => (
          <li key={provider.key}>
            <strong>{provider.label}</strong>:{' '}
            {provider.connected ? 'Connected' : 'Not connected'}
            {provider.isDefault ? ' (default)' : ''}
            {provider.isFallback ? ' (fallback)' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ConnectionStatus
