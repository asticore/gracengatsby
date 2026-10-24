'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  adminResetTwoFactorAction,
  beginTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  type TwoFactorActionResult,
} from '../twoFactorActions'

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

  const run = async (task: () => Promise<TwoFactorActionResult>, onOk?: (result: TwoFactorActionResult) => void) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await task()
      if (result.ok) {
        onOk?.(result)
        if (result.message) setNotice({ tone: 'ok', text: result.message })
      } else {
        setNotice({ tone: 'error', text: result.message || 'That did not work.' })
      }
    } catch {
      setNotice({ tone: 'error', text: 'Something went wrong. Check your connection and try again.' })
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
          <strong>Save these backup codes now.</strong> Each works once, in place of an authenticator code, if you lose
          your phone. They will not be shown again.
        </p>
        <ul style={{ fontFamily: 'monospace', fontSize: '1.1rem', columns: 2, listStyle: 'none', padding: 0 }}>
          {shownCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>
        <div style={rowStyle}>
          <button type="button" className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(shownCodes.join('\n')).catch((): void => undefined)}>
            Copy codes
          </button>
          <button type="button" className="btn btn--primary" onClick={doneWithCodes}>
            I have saved them
          </button>
        </div>
      </div>
    )
  }

  if (setup) {
    return (
      <div>
        <p>1. Scan this code with an authenticator app (Google Authenticator, 1Password, Authy and similar).</p>
        <div style={{ maxWidth: 220 }} dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
        <p>
          Cannot scan? Enter this key by hand: <code style={{ wordBreak: 'break-all' }}>{setup.secret}</code>
        </p>
        <form onSubmit={confirm}>
          <label style={fieldStyle}>
            2. Enter the 6-digit code the app shows
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
              Turn on two-step sign-in
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setSetup(null); setNotice(null) }}>
              Cancel
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
            <strong>Two-step sign-in is on.</strong> You have {backupCodesLeft} unused backup code{backupCodesLeft === 1 ? '' : 's'}.
          </p>
          <label style={fieldStyle}>
            Your password or a current code (needed for the buttons below)
            <input name="proof" type="password" autoComplete="off" value={proof} onChange={(event) => setProof(event.target.value)} disabled={busy} />
          </label>
          {banner}
          <div style={rowStyle}>
            <button type="button" className="btn btn--ghost" disabled={busy || !proof} onClick={regenerate}>
              Make new backup codes
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy || !proof} onClick={turnOff}>
              Turn off two-step sign-in
            </button>
          </div>
          <p>Making new backup codes stops the old ones working.</p>
        </>
      ) : (
        <>
          <p>Add a second step to signing in: a code from an app on your phone, as well as your password.</p>
          {banner}
          <button type="button" className="btn btn--primary" disabled={busy} onClick={begin}>
            Set up two-step sign-in
          </button>
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
