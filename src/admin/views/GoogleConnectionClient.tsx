'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { GoogleConnectionStatus } from '@/features/google/status'

import { GoogleFlagNotice } from './GoogleFlagNotice'
import { PickerRow } from './GooglePickers'
import './google-connection.css'

type Props = {
  status: GoogleConnectionStatus
  redirectUri: string
}

type Notice = { tone: 'ok' | 'error'; text: string }

/**
 * The Google connection screen (/admin/google-connection). Three collapsible
 * cards: the Google Cloud client, the sign-in, and the choices the dashboards read.
 */
export function GoogleConnectionClient({ status, redirectUri }: Props) {
  const [clientId, setClientId] = useState(status.clientId)
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState<'client' | 'disconnect' | null>(null)
  const [clientNotice, setClientNotice] = useState<Notice | null>(null)
  const [signInNotice, setSignInNotice] = useState<Notice | null>(null)
  const [connected, setConnected] = useState(status.connected)
  const [copied, setCopied] = useState(false)

  const hasClient = Boolean(status.clientId)

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const saveClient = async () => {
    setBusy('client')
    setClientNotice(null)
    try {
      const response = await fetch('/api/admin-google-client', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; message?: string; error?: string; signedOut?: boolean } | null
      if (response.ok && body?.ok) {
        setClientSecret('')
        if (body.signedOut) setConnected(false)
        setClientNotice({ tone: 'ok', text: body.message || 'Client saved.' })
      } else {
        setClientNotice({ tone: 'error', text: body?.error || 'The client could not be saved. Try again.' })
      }
    } catch {
      setClientNotice({ tone: 'error', text: 'The client could not be saved. Check the connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google? The dashboards will stop showing Google data until you connect again.')) return
    setBusy('disconnect')
    setSignInNotice(null)
    try {
      const response = await fetch('/api/google/disconnect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; error?: string } | null
      if (response.ok && body?.ok) {
        setConnected(false)
        setSignInNotice({ tone: 'ok', text: 'Google is disconnected. Your client ID and secret are kept.' })
      } else {
        setSignInNotice({ tone: 'error', text: body?.error || 'Google could not be disconnected. Try again.' })
      }
    } catch {
      setSignInNotice({ tone: 'error', text: 'Google could not be disconnected. Check the connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const accountLine = connected
    ? `Connected as ${status.connectedEmail || 'a Google account'}${status.connectedAt ? `, on ${status.connectedAt.slice(0, 10)}` : ''}.`
    : 'Not connected yet.'

  return (
    <div className="google-connection">
      <Suspense fallback={null}>
        <GoogleFlagNotice />
      </Suspense>

      <CollapsibleCard id="google-connection-client" title="Google Cloud client">
        <p className="google-connection__text">
          Set this up once. You create a small Google Cloud client for this site, so the site talks to Google as you, with read-only
          access.
        </p>
        <ol className="google-connection__steps">
          <li>In Google Cloud Console, create a project, or choose one you already have.</li>
          <li>Under APIs and services, switch on the Google Analytics Data API, Google Analytics Admin API, Google Search Console API, Tag Manager API and AdSense Management API.</li>
          <li>Under OAuth consent screen, fill in the app name and your e-mail address. Keep the app in testing and add your own Google account as a test user, or publish it.</li>
          <li>Under Credentials, create an OAuth client ID of type Web application.</li>
          <li>Under Authorised redirect URIs, add the address below exactly.</li>
          <li>Paste the Client ID and client secret here, then save.</li>
        </ol>
        <p className="google-connection__text">
          <span className="google-connection__label">Redirect address to copy:</span>{' '}
          <code className="google-connection__code">{redirectUri}</code>
        </p>
        <button type="button" className="btn btn--style-secondary google-connection__button" onClick={copyRedirect}>
          {copied ? 'Copied' : 'Copy redirect address'}
        </button>

        <div className="google-connection__field">
          <label htmlFor="google-client-id" className="google-connection__label">
            Client ID
          </label>
          <input
            id="google-client-id"
            className="google-connection__input"
            type="text"
            autoComplete="off"
            value={clientId}
            disabled={busy !== null}
            onChange={(event) => setClientId(event.target.value)}
          />
          <p className="google-connection__help">Ends in .apps.googleusercontent.com.</p>
        </div>

        <div className="google-connection__field">
          <label htmlFor="google-client-secret" className="google-connection__label">
            Client secret
          </label>
          <input
            id="google-client-secret"
            className="google-connection__input"
            type="password"
            autoComplete="new-password"
            placeholder={status.hasClientSecret ? 'Saved. Type here only to replace it.' : ''}
            value={clientSecret}
            disabled={busy !== null}
            onChange={(event) => setClientSecret(event.target.value)}
          />
          <p className="google-connection__help">Stored encrypted. It is never shown again.</p>
        </div>

        <button type="button" className="btn btn--style-primary google-connection__button" disabled={busy !== null || !clientId.trim()} onClick={saveClient}>
          {busy === 'client' ? 'Saving...' : 'Save client'}
        </button>
        {clientNotice && <p role="status" className={`google-connection__notice google-connection__notice--${clientNotice.tone}`}>{clientNotice.text}</p>}
      </CollapsibleCard>

      <CollapsibleCard id="google-connection-signin" title="Sign-in">
        <p className="google-connection__status">{accountLine}</p>
        {status.scopesGranted && <p className="google-connection__help">Asked for read-only access to Analytics, Search Console, Tag Manager and AdSense.</p>}
        {status.lastError && (
          <p role="alert" className="google-connection__notice google-connection__notice--error">
            Last error: {status.lastError}
          </p>
        )}
        {hasClient ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect to an API route, needs a full page load
          <a className="btn btn--style-primary google-connection__button" href="/api/google/connect">
            {connected ? 'Connect with Google again' : 'Connect with Google'}
          </a>
        ) : (
          <p className="google-connection__help">Save the Google Cloud client first, then connect.</p>
        )}
        {connected && (
          <button type="button" className="btn btn--style-secondary google-connection__button" disabled={busy !== null} onClick={disconnect}>
            {busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect Google'}
          </button>
        )}
        {signInNotice && <p role="status" className={`google-connection__notice google-connection__notice--${signInNotice.tone}`}>{signInNotice.text}</p>}
      </CollapsibleCard>

      <CollapsibleCard id="google-connection-choices" title="Choices for the dashboards">
        <p className="google-connection__text">
          Pick the property and sites the dashboards read. Choosing an Analytics property fills the measurement ID, and choosing a Tag
          Manager container fills the container ID on the Integrations page, but only where that field is blank.
        </p>
        <PickerRow
          kind="ga4"
          label="Analytics property"
          help="The Google Analytics 4 property whose visitors and pages the dashboard shows."
          current={status.ga4PropertyId}
          currentLabel={status.ga4PropertyId ? `Property ${status.ga4PropertyId}` : ''}
          disabled={!connected}
        />
        <PickerRow
          kind="gsc"
          label="Search Console site"
          help="The site whose search results the dashboard shows."
          current={status.searchConsoleSite}
          currentLabel={status.searchConsoleSite}
          disabled={!connected}
        />
        <PickerRow
          kind="gtm"
          label="Tag Manager container"
          help="The container whose ID is added to the site when Integrations leaves it blank."
          current={status.gtmAccountId && status.gtmContainerId ? `${status.gtmAccountId}/${status.gtmContainerId}` : ''}
          currentLabel={status.gtmContainerId ? `Container ${status.gtmContainerId}` : ''}
          disabled={!connected}
        />
        <PickerRow
          kind="adsense"
          label="AdSense account"
          help="The AdSense account whose earnings the dashboard shows."
          current={status.adsenseAccountId}
          currentLabel={status.adsensePublisherId || status.adsenseAccountId}
          disabled={!connected}
        />
        <p className="google-connection__help">
          <Link href="/admin/settings/site#integrations">Open Integrations</Link> to see the measurement ID and container ID that were filled in.
        </p>
      </CollapsibleCard>
    </div>
  )
}
