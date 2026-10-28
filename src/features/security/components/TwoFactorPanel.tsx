'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  adminResetTwoFactorAction,
  beginEmailTwoFactorAction,
  beginTwoFactorAction,
  confirmEmailTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  twoFactorPanelOptionsAction,
  type TwoFactorActionResult,
} from '../twoFactorActions'
import { usePortalText } from '@/features/accounts/components/PortalText'
import { localiseMessage } from '@/features/accounts/messages'

import { TrustedDevicesList } from './TrustedDevicesList'
import './twoFactorExtras.css'

/**
 * The two-step sign-in controls, shared by the admin screen and the customer
 * profile. Everything that decides anything runs in the server actions; this
 * only draws their answers.
 *
 * Backup codes are held in component state only, shown once, and dropped when
 * the person says they have saved them. They are never written anywhere.
 */

type Props = {
  enrolled: boolean
  backupCodesLeft: number
  /** Shows the "reset someone else's two-step" recovery tool. */
  isAdmin?: boolean
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

const noticeStyle = (tone: 'ok' | 'error'): React.CSSProperties => ({
  margin: '0.5rem 0',
  padding: '0.5rem 0.75rem',
  borderRadius: 4,
  border: `1px solid ${tone === 'ok' ? '#1a7f37' : '#b42318'}`,
})

const fieldStyle: React.CSSProperties = { display: 'block', margin: '0.5rem 0' }
const rowStyle: React.CSSProperties = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }

export const TwoFactorPanel: React.FC<Props> = ({ enrolled, backupCodesLeft, isAdmin }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null)
  const [code, setCode] = useState('')
  const [proof, setProof] = useState('')
  const [shownCodes, setShownCodes] = useState<string[] | null>(null)
  const [resetEmail, setResetEmail] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailSetup, setEmailSetup] = useState(false)
  const tx = usePortalText()

  useEffect(() => {
    let cancelled = false
    twoFactorPanelOptionsAction()
      .then((options) => {
        if (!cancelled) setEmailEnabled(options.emailEnabled)
      })
      .catch((): undefined => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (task: () => Promise<TwoFactorActionResult>, onOk?: (result: TwoFactorActionResult) => void) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await task()
      if (result.ok) {
        onOk?.(result)
        if (result.message) setNotice({ tone: 'ok', text: localiseMessage(result.message, tx) })
      } else {
        setNotice({ tone: 'error', text: result.message ? localiseMessage(result.message, tx) : tx('msg.didNotWork') })
      }
    } catch {
      setNotice({ tone: 'error', text: tx('panel.networkError') })
    } finally {
      setBusy(false)
    }
  }

  const begin = () =>
    run(beginTwoFactorAction, (result) => {
      if (result.secret && result.qrSvg) setSetup({ secret: result.secret, qrSvg: result.qrSvg })
    })

  const confirm = (event: React.FormEvent) => {
    event.preventDefault()
    return run(
      () => confirmTwoFactorAction(code),
      (result) => {
        setSetup(null)
        setCode('')
        setShownCodes(result.backupCodes ?? [])
      },
    )
  }

  const beginEmail = () =>
    run(beginEmailTwoFactorAction, () => {
      setEmailSetup(true)
      setCode('')
    })

  const confirmEmail = (event: React.FormEvent) => {
    event.preventDefault()
    return run(
      () => confirmEmailTwoFactorAction(code),
      (result) => {
        setEmailSetup(false)
        setCode('')
        setShownCodes(result.backupCodes ?? [])
      },
    )
  }

  const regenerate = () =>
    run(
      () => regenerateBackupCodesAction(proof),
      (result) => {
        setProof('')
        setShownCodes(result.backupCodes ?? [])
      },
    )

  const turnOff = () =>
    run(
      () => disableTwoFactorAction(proof),
      () => {
        setProof('')
        router.refresh()
      },
    )

  const doneWithCodes = () => {
    setShownCodes(null)
    router.refresh()
  }

  const banner = notice && (
    <p role="status" aria-live="polite" style={noticeStyle(notice.tone)}>
      {notice.text}
    </p>
  )

  if (shownCodes) {
    return (
      <div>
        <p>
          <strong>{tx('panel.tfSaveHeading')}</strong> {tx('panel.tfCodesIntro')}
        </p>
        <ul style={{ fontFamily: 'monospace', fontSize: '1.1rem', columns: 2, listStyle: 'none', padding: 0 }}>
          {shownCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>
        <div style={rowStyle}>
          <button type="button" className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(shownCodes.join('\n')).catch((): void => undefined)}>
            {tx('panel.tfCopyCodes')}
          </button>
          <button type="button" className="btn btn--primary" onClick={doneWithCodes}>
            {tx('panel.tfSaved')}
          </button>
        </div>
      </div>
    )
  }

  if (emailSetup) {
    return (
      <div>
        <p>{tx('panel.tfEmailSent')}</p>
        <form onSubmit={confirmEmail}>
          <label style={fieldStyle}>
            {tx('panel.tfCodeFromEmail')}
            <input
              name="emailCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy}
              required
            />
          </label>
          {banner}
          <div style={rowStyle}>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {tx('panel.tfTurnOn')}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={beginEmail}>
              {tx('auth.sendNewCode')}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setEmailSetup(false); setNotice(null) }}>
              {tx('panel.cancel')}
            </button>
          </div>
        </form>
        <p>{tx('panel.tfNothingChanges')}</p>
      </div>
    )
  }

  if (setup) {
    return (
      <div>
        <p>{tx('panel.tfScanStep')}</p>
        <div style={{ maxWidth: 220 }} dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
        <p>
          {tx('panel.tfCannotScan')} <code style={{ wordBreak: 'break-all' }}>{setup.secret}</code>
        </p>
        <form onSubmit={confirm}>
          <label style={fieldStyle}>
            {tx('panel.tfCodeStep')}
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy}
              required
            />
          </label>
          {banner}
          <div style={rowStyle}>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {tx('panel.tfTurnOn')}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setSetup(null); setNotice(null) }}>
              {tx('panel.cancel')}
            </button>
          </div>
        </form>
        <p>Nothing changes about how you sign in until you enter a code correctly.</p>
      </div>
    )
  }

  return (
    <div>
      {enrolled ? (
        <>
          <p>
            <strong>{tx('panel.tfOnHeading')}</strong>{' '}
            {tx(backupCodesLeft === 1 ? 'panel.tfCodesLeftOne' : 'panel.tfCodesLeftMany', { count: backupCodesLeft })}
          </p>
          <label style={fieldStyle}>
            {tx('panel.tfProofLabel')}
            <input name="proof" type="password" autoComplete="off" value={proof} onChange={(event) => setProof(event.target.value)} disabled={busy} />
          </label>
          {banner}
          <div style={rowStyle}>
            <button type="button" className="btn btn--ghost" disabled={busy || !proof} onClick={regenerate}>
              {tx('panel.tfNewCodes')}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy || !proof} onClick={turnOff}>
              {tx('panel.tfTurnOff')}
            </button>
          </div>
          <p>{tx('panel.tfNewCodesNote')}</p>
          <TrustedDevicesList />
        </>
      ) : (
        <>
          <p>{tx('panel.tfAddIntro')}</p>
          {banner}
          <div className="tf-methods">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={begin}>
              {tx('panel.tfSetupApp')}
            </button>
            {emailEnabled && (
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={beginEmail}>
                {tx('panel.tfSetupEmail')}
              </button>
            )}
          </div>
        </>
      )}

      {isAdmin && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Locked out someone else?</h3>
          <p>If a person has lost their phone and their backup codes, switch two-step off on their account. They can set it up again after signing in.</p>
          <div style={rowStyle}>
            <input
              type="email"
              name="resetEmail"
              placeholder="their@email.com"
              aria-label="Email address of the account to reset"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy || !resetEmail}
              onClick={() => run(() => adminResetTwoFactorAction(resetEmail), () => setResetEmail(''))}
            >
              Switch off their two-step
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
