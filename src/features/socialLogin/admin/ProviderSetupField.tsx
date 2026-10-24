'use client'

import React, { useEffect, useState } from 'react'
import { useFormFields } from '@/engine/ui'

import { PROVIDERS, REQUIRED_CREDENTIALS, isProviderId, redirectUriFor, type ProviderId } from '../providers'
import { SETUP_GUIDES } from '../setupGuides'
import { socialTestSummary } from '../testResult'

/**
 * The per-provider helper under each provider's fields on Settings >
 * Security > Social login: the setup guide, the exact redirect URL for this
 * site with a Copy button, a live ready/missing checklist, and a Test sign-in
 * button. The server enforces the same credential rule on save; this only shows it.
 */

const box: React.CSSProperties = { border: '1px solid rgba(128,128,128,0.4)', borderRadius: 6, padding: '0.75rem 1rem', margin: '0 0 1.25rem' }

export function ProviderSetupField({ path }: { path: string }) {
  const name = path.split('.').pop() ?? ''
  const id = name.replace(/Setup$/, '')
  const provider: ProviderId | null = isProviderId(id) ? id : null
  const group = path.split('.').slice(0, -1).join('.')

  const values = useFormFields(([fields]) => {
    const out: Record<string, unknown> = {}
    if (!provider) return out
    out.enabled = fields?.[`${group}.${provider}Enabled`]?.value
    out.confirmed = fields?.[`${group}.${provider}RedirectConfirmed`]?.value
    for (const [key] of REQUIRED_CREDENTIALS[provider]) {
      out[key] = fields?.[`${group}.${provider}${String(key).charAt(0).toUpperCase()}${String(key).slice(1)}`]?.value
    }
    return out
  })

  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [testNote, setTestNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/social/redirect-uris', { credentials: 'include' })
      .then((r): Promise<{ origin?: string } | null> => (r.ok ? r.json() : Promise.resolve(null)))
      .catch((): null => null)
      .then((body) => {
        if (cancelled) return
        // The server knows the public site address (SITE_URL); fall back to this page's own.
        setOrigin(body?.origin || window.location.origin)
        if (provider) setTestNote(socialTestSummary(window.location.search, provider))
      })
    return () => {
      cancelled = true
    }
  }, [provider])

  if (!provider) return null
  const guide = SETUP_GUIDES[provider]
  const uri = origin ? redirectUriFor(origin, provider) : ''
  const present = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

  const checklist: Array<[string, boolean]> = [
    ['Switch on', values.enabled === true],
    ...REQUIRED_CREDENTIALS[provider].map(([key, label]): [string, boolean] => [`${label} entered`, present(values[key])]),
    ['Redirect URL added in the provider console (tick the box above)', values.confirmed === true],
  ]
  const credentialsReady = REQUIRED_CREDENTIALS[provider].every(([key]) => present(values[key]))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={box} data-testid={`social-setup-${provider}`}>
      <strong>{PROVIDERS[provider].label} setup</strong>

      <details style={{ margin: '0.5rem 0' }}>
        <summary>Step-by-step guide</summary>
        <p>
          <a href={guide.consoleUrl} target="_blank" rel="noopener noreferrer">
            Open {guide.consoleLabel}
          </a>
        </p>
        <p>
          Name the app: {guide.appName}. Permissions requested: <code>{guide.scopes.join(', ')}</code>.
        </p>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.notes.length > 0 && (
          <ul>
            {guide.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </details>

      <div style={{ margin: '0.5rem 0' }}>
        <div>{provider === 'apple' ? 'Return URL (add it to the Services ID)' : 'Redirect URL (copy this into the provider console)'}</div>
        <code style={{ wordBreak: 'break-all' }}>{uri || 'Working out your site address...'}</code>{' '}
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={copy} disabled={!uri}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0' }} aria-label={`${PROVIDERS[provider].label} setup checklist`}>
        {checklist.map(([label, ready]) => (
          <li key={label}>
            <span style={{ color: ready ? 'var(--theme-success-500, #2e7d32)' : 'var(--theme-error-500, #c62828)' }}>
              {ready ? 'Ready' : 'Missing'}
            </span>{' '}
            - {label}
          </li>
        ))}
      </ul>

      <div>
        {credentialsReady ? (
          <a href={`/api/social/${provider}/start?mode=test`} target="_blank" rel="noopener noreferrer" className="btn btn--style-secondary btn--size-small">
            Test sign-in
          </a>
        ) : (
          <button type="button" className="btn btn--style-secondary btn--size-small" disabled>
            Test sign-in
          </button>
        )}
        <span style={{ marginLeft: 8, opacity: 0.7 }}>Save this page first. The test opens a new tab, signs nobody in and creates no account.</span>
        {testNote && (
          <p role="status" style={{ margin: '0.5rem 0 0' }}>
            {testNote}
          </p>
        )}
      </div>
    </div>
  )
}
