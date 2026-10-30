'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { GoogleConnectionStatus } from '@/features/google/status'
import type { ProviderStatus, TrackingConnectionStatus } from '@/features/tracking/connect/status'
import type { UiStringKey } from '@/features/uiStrings'

import './google-connection.css'

type Props = {
  status: TrackingConnectionStatus
  google: GoogleConnectionStatus
  /** The redirect address for each provider, built from the origin the admin is using. */
  redirectUris: { meta: string; tiktok: string; google: string }
  /** Only administrators can save app secrets. Everyone else sees the screen read-only. */
  isAdmin: boolean
}

type Tone = 'ok' | 'error'
type Notice = { tone: Tone; text: string }
type Json = Record<string, unknown>
type Item = { value: string; label: string }
type T = ReturnType<typeof useAdminT>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** One call to one of our own routes. A network failure becomes a reason, never a thrown error. */
async function call(url: string, init?: RequestInit): Promise<Json> {
  try {
    const response = await fetch(url, { credentials: 'include', ...init })
    const body = (await response.json().catch((): null => null)) as Json | null
    return body ?? { ok: false, reason: 'error' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

const jsonInit = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** The reason codes the routes return, as sentences. Provider text is never shown. */
function reasonText(t: T, reason: string): string {
  if (reason === 'not-connected') return t('tconnect.err_not_connected')
  if (reason === 'expired') return t('tconnect.notice_expired')
  if (reason === 'not-listed' || reason === 'bad-value') return t('tconnect.err_not_listed')
  if (reason === 'google') return t('tconnect.err_google')
  if (reason === 'no-app') return t('tconnect.notice_no_app')
  if (reason === 'no-access') return t('tconnect.notice_no_access')
  if (reason === 'network') return t('tconnect.notice_network')
  if (reason === 'refused') return t('tconnect.notice_refused')
  if (reason === 'forbidden') return t('tconnect.notice_forbidden')
  if (reason === 'bad-app') return t('tconnect.notice_bad_app')
  return t('tconnect.notice_error')
}

/** The short notice the callback leaves in the address, such as "meta-connected" or "google-state". */
function noticeText(t: T, notice: string, providerName: (p: string) => string): Notice | null {
  const dash = notice.indexOf('-')
  if (dash < 1) return null
  const provider = notice.slice(0, dash)
  const reason = notice.slice(dash + 1)
  if (provider === 'google') {
    if (reason === 'connected') return { tone: 'ok', text: t('tconnect.notice_google_connected') }
    if (reason === 'denied') return { tone: 'error', text: t('tconnect.notice_denied') }
    if (reason === 'forbidden') return { tone: 'error', text: t('tconnect.notice_forbidden') }
    return { tone: 'error', text: t('tconnect.notice_google_failed') }
  }
  if (provider !== 'meta' && provider !== 'tiktok') return null
  if (reason === 'connected') return { tone: 'ok', text: t('tconnect.notice_connected', { provider: providerName(provider) }) }
  if (reason === 'denied') return { tone: 'error', text: t('tconnect.notice_denied') }
  if (reason === 'forbidden') return { tone: 'error', text: t('tconnect.notice_forbidden') }
  if (reason === 'state') return { tone: 'error', text: t('tconnect.notice_state') }
  if (reason === 'no-app') return { tone: 'error', text: t('tconnect.notice_no_app') }
  if (reason === 'no-secret') return { tone: 'error', text: t('tconnect.notice_no_secret') }
  if (reason === 'no-code') return { tone: 'error', text: t('tconnect.notice_no_code') }
  if (reason === 'refused') return { tone: 'error', text: t('tconnect.notice_refused') }
  if (reason === 'network') return { tone: 'error', text: t('tconnect.notice_network') }
  if (reason === 'no-access') return { tone: 'error', text: t('tconnect.notice_no_access') }
  return { tone: 'error', text: t('tconnect.notice_error') }
}

const dayOf = (iso: string): string => iso.slice(0, 10)

/** The sentence after a pixel is saved: a replacement names both IDs. */
function pixelMessage(t: T, body: Json): string {
  const value = str(body.pixelId)
  const previous = str(body.previous)
  return body.replaced === true && previous ? t('tconnect.picked_replaced', { previous, value }) : t('tconnect.picked', { value })
}

/** A picker: load the provider's list, choose one, save. The server re-checks the choice against a fresh list. */
function ChoicePicker(props: {
  label: string
  help: string
  saved: string
  load: () => Promise<Json>
  save: (value: string) => Promise<Json>
  disabled: boolean
  emptyText: string
  onSaved: (body: Json) => void
  savedMessage: (body: Json) => string
  t: T
}) {
  const { t } = props
  const [items, setItems] = useState<Item[] | null>(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState<'load' | 'save' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const off = props.disabled || busy !== null

  const loadList = async () => {
    setBusy('load')
    setNotice(null)
    const body = await props.load()
    if (body.ok === true && Array.isArray(body.items)) {
      const list = body.items as Item[]
      setItems(list)
      if (list.length === 0) setNotice({ tone: 'error', text: props.emptyText })
    } else {
      setNotice({ tone: 'error', text: reasonText(t, str(body.reason)) })
    }
    setBusy(null)
  }

  const save = async () => {
    if (!selected) return
    setBusy('save')
    setNotice(null)
    const body = await props.save(selected)
    if (body.ok === true) {
      setNotice({ tone: 'ok', text: props.savedMessage(body) })
      props.onSaved(body)
      setSelected('')
    } else {
      setNotice({ tone: 'error', text: reasonText(t, str(body.reason)) })
    }
    setBusy(null)
  }

  return (
    <div className="google-connection__row">
      <p className="google-connection__row-label">
        <strong>{props.label}</strong>
      </p>
      <p className="google-connection__help">{props.help}</p>
      <p className="google-connection__current">{props.saved || t('tconnect.nothing_chosen')}</p>
      <div className="google-connection__picker">
        <select className="google-connection__select" aria-label={props.label} value={selected} disabled={off} onChange={(event) => setSelected(event.target.value)}>
          <option value="">{items ? t('tconnect.choose_one') : t('tconnect.load_first')}</option>
          {(items ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--style-secondary google-connection__button" disabled={off} onClick={loadList}>
          {busy === 'load' ? t('tconnect.loading') : t('tconnect.load_list')}
        </button>
        <button type="button" className="btn btn--style-primary google-connection__button" disabled={off || !selected} onClick={save}>
          {busy === 'save' ? t('tconnect.saving') : t('tconnect.save_choice')}
        </button>
      </div>
      {notice && (
        <p role="status" className={`google-connection__notice google-connection__notice--${notice.tone}`}>
          {notice.text}
        </p>
      )}
    </div>
  )
}

/** Copy button and the exact redirect address for one console. */
function RedirectAddress({ uri, t }: { uri: string; t: T }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      <p className="google-connection__text">
        <span className="google-connection__label">{t('tconnect.redirect_label')}</span> <code className="google-connection__code">{uri}</code>
      </p>
      <p className="google-connection__help">{t('tconnect.redirect_note')}</p>
      <button type="button" className="btn btn--style-secondary google-connection__button" onClick={copy}>
        {copied ? t('tconnect.copied') : t('tconnect.copy_redirect')}
      </button>
    </div>
  )
}

/** A Connect button and a Disconnect button for one platform. Both are plain links or POSTs to our routes. */
function SignInRow(props: {
  provider: 'meta' | 'tiktok'
  name: string
  status: ProviderStatus
  canConnect: boolean
  onDisconnected: (revoked: boolean) => void
  onError: (text: string) => void
  t: T
}) {
  const { t, status } = props
  const [busy, setBusy] = useState(false)
  const disconnect = async () => {
    if (!window.confirm(t('tconnect.confirm_disconnect', { provider: props.name }))) return
    setBusy(true)
    const body = await call(`/api/tracking-connect/${props.provider}/disconnect`, jsonInit({}))
    setBusy(false)
    if (body.ok === true) props.onDisconnected(body.revokedAtProvider === true)
    else props.onError(reasonText(t, str(body.reason)))
  }
  const account = status.accountName || props.name
  const accountLine = status.connected
    ? status.connectedAt
      ? t('tconnect.connected_on', { account, date: dayOf(status.connectedAt) })
      : t('tconnect.connected_as', { account })
    : t('tconnect.not_connected')
  return (
    <div>
      <p className="google-connection__current">{accountLine}</p>
      {status.connected && status.expiresAt && <p className="google-connection__help">{t('tconnect.expires_on', { date: dayOf(status.expiresAt) })}</p>}
      {!status.appId || !status.hasAppSecret ? <p className="google-connection__help">{t('tconnect.needs_app')}</p> : null}
      <div className="google-connection__picker">
        {!status.connected ? (
          <a
            className={`btn btn--style-primary google-connection__button${props.canConnect ? '' : ' is-disabled'}`}
            href={props.canConnect ? `/api/tracking-connect/${props.provider}/start` : undefined}
            aria-disabled={!props.canConnect}
          >
            {t('tconnect.connect', { provider: props.name })}
          </a>
        ) : (
          <button type="button" className="btn btn--style-secondary google-connection__button" disabled={busy || !props.canConnect} onClick={disconnect}>
            {t('tconnect.disconnect')}
          </button>
        )}
      </div>
    </div>
  )
}

/** The app ID and secret form. The secret is admin-only; the ID is shown to everyone. */
function AppForm(props: { provider: 'meta' | 'tiktok'; status: ProviderStatus; isAdmin: boolean; onSaved: (appId: string, signedOut: boolean) => void; t: T }) {
  const { t, status } = props
  const [appId, setAppId] = useState(status.appId)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const save = async () => {
    setBusy(true)
    setNotice(null)
    const body = await call(`/api/tracking-connect/${props.provider}/app`, jsonInit({ appId, appSecret: secret }))
    setBusy(false)
    if (body.ok === true) {
      setSecret('')
      setNotice({ tone: 'ok', text: body.signedOut === true ? t('tconnect.app_saved_signed_out') : t('tconnect.app_saved') })
      props.onSaved(appId, body.signedOut === true)
    } else {
      setNotice({ tone: 'error', text: reasonText(t, str(body.reason)) })
    }
  }
  return (
    <div className="google-connection__field">
      <label className="google-connection__label" htmlFor={`${props.provider}-app-id`}>
        {t('tconnect.app_id')}
      </label>
      <input id={`${props.provider}-app-id`} className="google-connection__input" type="text" inputMode="numeric" autoComplete="off" value={appId} disabled={!props.isAdmin || busy} onChange={(e) => setAppId(e.target.value)} />
      {props.isAdmin && (
        <>
          <label className="google-connection__label" htmlFor={`${props.provider}-app-secret`}>
            {t('tconnect.app_secret')}
          </label>
          <input
            id={`${props.provider}-app-secret`}
            className="google-connection__input"
            type="password"
            autoComplete="new-password"
            placeholder={status.hasAppSecret ? t('tconnect.secret_saved') : ''}
            value={secret}
            disabled={busy}
            onChange={(e) => setSecret(e.target.value)}
          />
          <p className="google-connection__help">{t('tconnect.secret_help')}</p>
          <button type="button" className="btn btn--style-primary google-connection__button" disabled={busy || !appId} onClick={save}>
            {busy ? t('tconnect.saving') : t('tconnect.save_app')}
          </button>
        </>
      )}
      {notice && (
        <p role="status" className={`google-connection__notice google-connection__notice--${notice.tone}`}>
          {notice.text}
        </p>
      )}
    </div>
  )
}

/** One platform card: guide, redirect address, app, sign-in and the pixel picker. */
function PlatformCard(props: {
  provider: 'meta' | 'tiktok'
  name: string
  cardTitle: UiStringKey
  intro: UiStringKey
  steps: UiStringKey[]
  pixelHelp: UiStringKey
  redirectUri: string
  status: TrackingConnectionStatus['meta']
  isAdmin: boolean
  onChanged: (next: Partial<TrackingConnectionStatus['meta']>) => void
  onNotice: (notice: Notice) => void
  t: T
}) {
  const { t, status } = props
  const [current, setCurrent] = useState(status.currentPixelId)
  const ready = Boolean(status.appId && status.hasAppSecret)
  const pixelSaved = current ? t('tconnect.id_on_integrations', { value: current }) : t('tconnect.no_id_on_integrations')

  return (
    <CollapsibleCard id={`tracking-connections-${props.provider}`} title={t(props.cardTitle)}>
      <p className="google-connection__text">{t(props.intro)}</p>
      <ol className="google-connection__steps">
        {props.steps.map((step) => (
          <li key={step}>{t(step)}</li>
        ))}
      </ol>
      <RedirectAddress uri={props.redirectUri} t={t} />
      <AppForm
        provider={props.provider}
        status={status}
        isAdmin={props.isAdmin}
        t={t}
        onSaved={(appId, signedOut) => props.onChanged({ appId, hasAppSecret: true, ...(signedOut ? { connected: false, accountName: '' } : {}) })}
      />
      <SignInRow
        provider={props.provider}
        name={props.name}
        status={status}
        canConnect={ready}
        t={t}
        onDisconnected={(revoked) => {
          props.onChanged({ connected: false, accountName: '', expiresAt: '' })
          props.onNotice({ tone: 'ok', text: t(revoked ? 'tconnect.disconnected_revoked' : 'tconnect.disconnected', { provider: props.name }) })
        }}
        onError={(text) => props.onNotice({ tone: 'error', text })}
      />
      <ChoicePicker
        t={t}
        label={t('tconnect.pixel_title')}
        help={t(props.pixelHelp)}
        saved={pixelSaved}
        disabled={!status.connected}
        emptyText={t('tconnect.empty_list')}
        load={() => call(`/api/tracking-connect/${props.provider}/pixels`)}
        save={(value) => call(`/api/tracking-connect/${props.provider}/pick`, jsonInit({ value }))}
        savedMessage={(body) => pixelMessage(t, body)}
        onSaved={(body) => setCurrent(str(body.pixelId))}
      />
      <p className="google-connection__help">{t('tconnect.manual')}</p>
    </CollapsibleCard>
  )
}

function GoogleCard({ google, redirectUri, isAdmin, t }: { google: GoogleConnectionStatus; redirectUri: string; isAdmin: boolean; t: T }) {
  const [ga4, setGa4] = useState(google.ga4MeasurementId)
  const [gtm, setGtm] = useState(google.gtmContainerId)
  const [connected, setConnected] = useState(google.connected)
  const [notice, setNotice] = useState<Notice | null>(null)
  const hasClient = Boolean(google.clientId)
  const account = google.connectedEmail || 'Google'
  const accountLine = connected ? t('tconnect.connected_as', { account }) : t('tconnect.not_connected')

  const disconnect = async () => {
    if (!window.confirm(t('tconnect.confirm_disconnect', { provider: 'Google' }))) return
    const body = await call('/api/google/disconnect', jsonInit({}))
    if (body.ok === true) {
      setConnected(false)
      setNotice({ tone: 'ok', text: t('tconnect.disconnected', { provider: 'Google' }) })
    } else {
      setNotice({ tone: 'error', text: reasonText(t, str(body.reason)) })
    }
  }

  return (
    <CollapsibleCard id="tracking-connections-google" title={t('tconnect.card_google')}>
      <p className="google-connection__text">{t('tconnect.google_intro')}</p>
      <RedirectAddress uri={redirectUri} t={t} />
      <p className="google-connection__current">{accountLine}</p>
      {!hasClient ? (
        <p className="google-connection__help">
          {t('tconnect.needs_google_client')} <AdminLink path="/google-connection">{t('tconnect.open_google_connection')}</AdminLink>
        </p>
      ) : (
        <div className="google-connection__picker">
          {connected ? (
            <button type="button" className="btn btn--style-secondary google-connection__button" disabled={!isAdmin} onClick={disconnect}>
              {t('tconnect.disconnect')}
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect to an API route, needs a full page load
            <a className="btn btn--style-primary google-connection__button" href="/api/google/connect?return=tracking">
              {t('tconnect.connect', { provider: 'Google' })}
            </a>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className={`google-connection__notice google-connection__notice--${notice.tone}`}>
          {notice.text}
        </p>
      )}
      <ChoicePicker
        t={t}
        label={t('tconnect.google_property_label')}
        help={t('tconnect.google_property_help')}
        saved={ga4 ? t('tconnect.current_value', { value: ga4 }) : t('tconnect.nothing_chosen')}
        disabled={!connected}
        emptyText={t('tconnect.empty_list')}
        load={() => call('/api/tracking-connect/google/lists?kind=ga4')}
        save={(value) => call('/api/tracking-connect/google/pick', jsonInit({ kind: 'ga4', value }))}
        savedMessage={(body) => (str(body.value) ? t('tconnect.picked', { value: str(body.value) }) : t('tconnect.google_no_stream'))}
        onSaved={(body) => setGa4(str(body.value) || ga4)}
      />
      <ChoicePicker
        t={t}
        label={t('tconnect.google_container_label')}
        help={t('tconnect.google_container_help')}
        saved={gtm ? t('tconnect.current_value', { value: gtm }) : t('tconnect.nothing_chosen')}
        disabled={!connected}
        emptyText={t('tconnect.empty_list')}
        load={() => call('/api/tracking-connect/google/lists?kind=gtm')}
        save={(value) => call('/api/tracking-connect/google/pick', jsonInit({ kind: 'gtm', value }))}
        savedMessage={(body) => t('tconnect.picked', { value: str(body.value) })}
        onSaved={(body) => setGtm(str(body.value) || gtm)}
      />
      <p className="google-connection__help">{t('tconnect.manual')}</p>
    </CollapsibleCard>
  )
}

function Body({ status, google, redirectUris, isAdmin }: Props) {
  const t = useAdminT()
  const search = useSearchParams()
  const notice = noticeText(t, search.get('notice') ?? '', (p) => (p === 'tiktok' ? 'TikTok' : 'Facebook'))
  const [metaStatus, setMetaStatus] = useState(status.meta)
  const [tiktokStatus, setTiktokStatus] = useState(status.tiktok)
  const [flash, setFlash] = useState<Notice | null>(null)
  const shown = flash ?? notice

  return (
    <div className="google-connection">
      <p className="google-connection__text">{t('tconnect.intro')}</p>
      {shown && (
        <p role="status" className={`google-connection__notice google-connection__notice--${shown.tone}`}>
          {shown.text}
        </p>
      )}
      <GoogleCard google={google} redirectUri={redirectUris.google} isAdmin={isAdmin} t={t} />
      <PlatformCard
        provider="meta"
        name="Facebook"
        cardTitle="tconnect.card_meta"
        intro="tconnect.meta_intro"
        steps={['tconnect.meta_step1', 'tconnect.meta_step2', 'tconnect.meta_step3', 'tconnect.meta_step4', 'tconnect.meta_step5']}
        pixelHelp="tconnect.pixel_help_meta"
        redirectUri={redirectUris.meta}
        status={metaStatus}
        isAdmin={isAdmin}
        t={t}
        onChanged={(next) => setMetaStatus({ ...metaStatus, ...next })}
        onNotice={setFlash}
      />
      <PlatformCard
        provider="tiktok"
        name="TikTok"
        cardTitle="tconnect.card_tiktok"
        intro="tconnect.tiktok_intro"
        steps={['tconnect.tiktok_step1', 'tconnect.tiktok_step2', 'tconnect.tiktok_step3', 'tconnect.tiktok_step4']}
        pixelHelp="tconnect.pixel_help_tiktok"
        redirectUri={redirectUris.tiktok}
        status={tiktokStatus}
        isAdmin={isAdmin}
        t={t}
        onChanged={(next) => setTiktokStatus({ ...tiktokStatus, ...next })}
        onNotice={setFlash}
      />
    </div>
  )
}

/** The Tracking connections screen (/admin/tracking-connections). Sign-ins for Google, Meta and TikTok. */
export function TrackingConnectionsClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  )
}

