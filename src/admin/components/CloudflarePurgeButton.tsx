'use client'

import React, { useState } from 'react'

type PurgeResult = {
  ran?: boolean
  errors?: string[]
}

/**
 * The "Purge Cloudflare cache" control on the Integrations settings screen.
 *
 * Purges all cached pages from Cloudflare zone. Requires integrations.cloudflare
 * to be configured with zoneId and apiToken.
 */
export const CloudflarePurgeButton: React.FC = () => {
  const [purging, setPurging] = useState(false)
  const [result, setResult] = useState<PurgeResult | null>(null)

  const purge = async () => {
    setPurging(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin-cloudflare-purge', {
        method: 'POST',
        credentials: 'include',
      })
      const body = (await response.json().catch(() => ({}))) as PurgeResult
      setResult(
        response.ok && body.ran
          ? body
          : { ran: false, errors: body.errors || ['The purge could not be run. Are you still signed in?'] },
      )
    } catch (error) {
      setResult({ ran: false, errors: [error instanceof Error ? error.message : String(error)] })
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <button
        type="button"
        onClick={purge}
        disabled={purging}
        className="btn btn--style-secondary"
        style={{ margin: 0 }}
      >
        {purging ? 'Purging…' : 'Purge cache now'}
      </button>

      {result && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            lineHeight: 1.5,
            color: result.ran ? '#1a7f37' : '#b3261e',
          }}
        >
          {result.ran
            ? 'Cache purged successfully.'
            : result.errors?.join(' ') || 'Cache purge failed.'}
        </p>
      )}
    </div>
  )
}
