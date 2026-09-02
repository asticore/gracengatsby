'use client'

import { useEffect } from 'react'

/**
 * Catches any error thrown while rendering an admin screen and shows it,
 * instead of leaving the visitor looking at a blank page with nothing in the
 * console to go on. Client-side render errors keep their real message in
 * production (only server-render errors get redacted to a digest), so this is
 * also the fastest way to see what actually broke.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Still worth a console entry for anyone who does have DevTools open.
    console.error('[admin]', error)
  }, [error])

  return (
    <div
      style={{
        padding: 32,
        fontFamily: 'monospace',
        color: '#111',
        background: '#fff',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>This admin screen hit an error</h1>
      <p style={{ marginBottom: 8 }}>
        <strong>Message:</strong> {error.message || '(no message)'}
      </p>
      {error.digest && (
        <p style={{ marginBottom: 8 }}>
          <strong>Digest:</strong> {error.digest}
        </p>
      )}
      {error.stack && (
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f4f4f4', padding: 12, borderRadius: 4 }}>
          {error.stack}
        </pre>
      )}
      <button
        type="button"
        onClick={() => reset()}
        style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  )
}