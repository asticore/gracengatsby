'use client'

import Link from 'next/link'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
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
  const t = useAdminT()
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
        setClientNotice({ tone: 'ok', text: body.message || t('gc.lit.client_saved') })
      } else {
        setClientNotice({ tone: 'error', text: body?.error || t('gc.lit.client_save_error') })
      }
    } catch {
      setClientNotice({ tone: 'error', text: t('gc.lit.client_save_network_error') })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (!window.confirm(t('gc.lit.confirm_disconnect'))) return
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
        setSignInNotice({ tone: 'ok', text: t('gc.lit.disconnected') })
      } else {
        setSignInNotice({ tone: 'error', text: body?.error || t('gc.lit.disconnect_error') })
      }
    } catch {
      setSignInNotice({ tone: 'error', text: t('gc.lit.disconnect_network_error') })
    } finally {
      setBusy(null)
    }
  }

  const account = status.connectedEmail || t('gc.lit.a_google_account')
  const accountLine = connected
    ? status.connectedAt
      ? t('gc.lit.connected_on', { account, date: status.connectedAt.slice(0, 10) })
      : t('gc.lit.connected_as', { account })
    : t('gc.lit.not_connected')

  return (
    <div className="google-connection">
      <Suspense fallback={null}>
        <GoogleFlagNotice />
      </Suspense>

      <CollapsibleCard id="google-connection-client" title={t('gc.lit.card_client')}>
        <p className="google-connection__text">
          {t('gc.lit.intro')}
        </p>
        <ol className="google-connection__steps">
          <li>{t('gc.lit.step1')}</li>
          <li>{t('gc.lit.step2')}</li>
          <li>{t('gc.lit.step3')}</li>
          <li>{t('gc.lit.step4')}</li>
          <li>{t('gc.lit.step5')}</li>
          <li>{t('gc.lit.step6')}</li>
        </ol>
        <p className="google-connection__text">
          <span className="google-connection__label">{t('gc.lit.redirect_label')}</span>{' '}
          <code className="google-connection__code">{redirectUri}</code>
        </p>
        <button type="button" className="btn btn--style-secondary google-connection__button" onClick={copyRedirect}>
          {copied ? t('gc.lit.copied') : t('gc.lit.copy_redirect')}
        </button>

        <div className="google-connection__field">
          <label htmlFor="google-client-id" className="google-connection__label">
            {t('gc.lit.client_id')}
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
          <p className="google-connection__help">{t('gc.lit.client_id_help')}</p>
        </div>

        <div className="google-connection__field">
          <label htmlFor="google-client-secret" className="google-connection__label">
            {t('gc.lit.client_secret')}
          </label>
          <input
            id="google-client-secret"
            className="google-connection__input"
            type="password"
            autoComplete="new-password"
            placeholder={status.hasClientSecret ? t('gc.lit.secret_saved_placeholder') : ''}
            value={clientSecret}
            disabled={busy !== null}
            onChange={(event) => setClientSecret(event.target.value)}
          />
          <p className="google-connection__help">{t('gc.lit.secret_help')}</p>
        </div>

        <button type="button" className="btn btn--style-primary google-connection__button" disabled={busy !== null || !clientId.trim()} onClick={saveClient}>
          {busy === 'client' ? t('gc.lit.saving') : t('gc.lit.save_client')}
        </button>
        {clientNotice && <p role="status" className={`google-connection__notice google-connection__notice--${clientNotice.tone}`}>{clientNotice.text}</p>}
      </CollapsibleCard>

      <CollapsibleCard id="google-connection-signin" title={t('gc.lit.card_signin')}>
        <p className="google-connection__status">{accountLine}</p>
        {status.scopesGranted && <p className="google-connection__help">Asked for read-only access to Analytics, Search Console, Tag Manager and AdSense.</p>}
        {status.lastError && (
          <p role="alert" className="google-connection__notice google-connection__notice--error">
            {t('gc.lit.last_error', { error: String(status.lastError) })}
          </p>
        )}
        {hasClient ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect to an API route, needs a full page load
          <a className="btn btn--style-primary google-connection__button" href="/api/google/connect">
            {connected ? t('gc.lit.connect_again') : t('gc.lit.connect')}
          </a>
        ) : (
          <p className="google-connection__help">{t('gc.lit.save_client_first')}</p>
        )}
        {connected && (
          <button type="button" className="btn btn--style-secondary google-connection__button" disabled={busy !== null} onClick={disconnect}>
            {busy === 'disconnect' ? t('gc.lit.disconnecting') : t('gc.lit.disconnect')}
          </button>
        )}
        {signInNotice && <p role="status" className={`google-connection__notice google-connection__notice--${signInNotice.tone}`}>{signInNotice.text}</p>}
      </CollapsibleCard>

      <CollapsibleCard id="google-connection-choices" title={t('gc.lit.card_choices')}>
        <p className="google-connection__text">
          {t('integrations.google.choices')}
        </p>
        <PickerRow
          kind="ga4"
          label={t('integrations.google.ga4Label')}
          help={t('integrations.google.ga4Help')}
          current={status.ga4PropertyId}
          currentLabel={status.ga4PropertyId ? t('gc.lit.property', { id: status.ga4PropertyId }) : ''}
          disabled={!connected}
        />
        <PickerRow
          kind="gsc"
          label={t('gc.lit.gsc_label')}
          help={t('gc.lit.gsc_help')}
          current={status.searchConsoleSite}
          currentLabel={status.searchConsoleSite}
          disabled={!connected}
        />
        <PickerRow
          kind="gtm"
          label={t('integrations.google.gtmLabel')}
          help={t('integrations.google.gtmHelp')}
          current={status.gtmAccountId && status.gtmContainerId ? `${status.gtmAccountId}/${status.gtmContainerId}` : ''}
          currentLabel={status.gtmContainerId ? t('gc.lit.container', { id: status.gtmContainerId }) : ''}
          disabled={!connected}
        />
        <PickerRow
          kind="adsense"
          label={t('integrations.google.adsenseLabel')}
          help={t('integrations.google.adsenseHelp')}
          current={status.adsenseAccountId}
          currentLabel={status.adsensePublisherId || status.adsenseAccountId}
          disabled={!connected}
        />
        <p className="google-connection__help">
          <Link href="/admin/settings/site#integrations">{t('integrations.openLink')}</Link> {t('integrations.seeIds')}
        </p>
      </CollapsibleCard>
    </div>
  )
}
