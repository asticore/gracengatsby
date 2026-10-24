'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  accountSessionsAction,
  adminRevokeAllSessionsAction,
  adminRevokeSessionAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from '../userSessionActions'
import type { SessionOutcome, SessionView } from '../userSessionService'
import { TrustedDevicesList } from './TrustedDevicesList'

/**
 * The signed-in devices list, shared by the admin screen and the customer
 * profile. Everything that decides anything runs in the server actions; this
 * only draws their answers. The device being used is marked and has no Revoke
 * button, so nobody ends their own session by accident from here.
 */

type Props = {
  sessions: SessionView[]
  /** Shows the "look up another account" tool. The server re-checks the role. */
  isAdmin?: boolean
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

const noticeStyle = (tone: 'ok' | 'error'): React.CSSProperties => ({
  margin: '0.5rem 0',
  padding: '0.5rem 0.75rem',
  borderRadius: 4,
  border: `1px solid ${tone === 'ok' ? '#1a7f37' : '#b42318'}`,
})

const rowStyle: React.CSSProperties = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }
const itemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: '0.75rem 0',
  borderBottom: '1px solid rgba(128,128,128,0.35)',
}
const badgeStyle: React.CSSProperties = { marginLeft: '0.5rem', padding: '0.1rem 0.5rem', borderRadius: 999, border: '1px solid currentColor', fontSize: '0.8rem' }

const when = (iso: string | null): string => {
  if (!iso) return 'Unknown'
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time).toLocaleString() : 'Unknown'
}

const SessionList: React.FC<{ sessions: SessionView[]; busy: boolean; onRevoke: (id: string) => void }> = ({ sessions, busy, onRevoke }) => {
  if (sessions.length === 0) return <p>No signed-in devices are listed.</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sessions.map((session) => (
        <li key={session.id} style={itemStyle}>
          <div>
            <strong>{session.device}</strong>
            {session.current && <span style={badgeStyle}>This device</span>}
            <div>
              Near {session.ip ?? 'unknown address'} - signed in {when(session.createdAt)} - last active {when(session.lastSeenAt)}
            </div>
          </div>
          {!session.current && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => onRevoke(session.id)}>
              Revoke
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export const SessionsPanel: React.FC<Props> = ({ sessions, isAdmin }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [lookupEmail, setLookupEmail] = useState('')
  const [looked, setLooked] = useState<{ email: string; sessions: SessionView[] } | null>(null)

  const run = async (task: () => Promise<SessionOutcome>, after?: () => Promise<void> | void) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await task()
      setNotice({ tone: result.ok ? 'ok' : 'error', text: result.message || (result.ok ? 'Done.' : 'That did not work.') })
      if (result.ok) await after?.()
    } catch {
      setNotice({ tone: 'error', text: 'Something went wrong. Check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  const lookup = async (email: string) => {
    const result = await accountSessionsAction(email)
    if (result.ok) setLooked({ email, sessions: result.sessions })
    else {
      setLooked(null)
      setNotice({ tone: 'error', text: result.message || 'That did not work.' })
    }
  }

  const others = sessions.filter((session) => !session.current).length

  return (
    <div>
      <SessionList sessions={sessions} busy={busy} onRevoke={(id) => run(() => revokeSessionAction(id), () => router.refresh())} />
      <div style={rowStyle}>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy || others === 0}
          onClick={() => run(() => revokeOtherSessionsAction(), () => router.refresh())}
        >
          Sign out other devices
        </button>
      </div>
      <p>Devices that signed in before this list existed are not shown here. They sign out on their own within a couple of hours.</p>
      {notice && (
        <p role="status" aria-live="polite" style={noticeStyle(notice.tone)}>
          {notice.text}
        </p>
      )}

      <TrustedDevicesList />

      {isAdmin && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Another account</h3>
          <p>Look up the signed-in devices of a customer or team member and sign them out. Each sign-out is written to the audit log.</p>
          <div style={rowStyle}>
            <input
              type="email"
              name="lookupEmail"
              placeholder="their@email.com"
              aria-label="Email address of the account"
              value={lookupEmail}
              onChange={(event) => setLookupEmail(event.target.value)}
              disabled={busy}
            />
            <button type="button" className="btn btn--ghost" disabled={busy || !lookupEmail} onClick={() => lookup(lookupEmail.trim())}>
              Show their devices
            </button>
          </div>
          {looked && (
            <>
              <SessionList
                sessions={looked.sessions}
                busy={busy}
                onRevoke={(id) => run(() => adminRevokeSessionAction(id), () => lookup(looked.email))}
              />
              <div style={rowStyle}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy || looked.sessions.length === 0}
                  onClick={() => run(() => adminRevokeAllSessionsAction(looked.email), () => lookup(looked.email))}
                >
                  Sign out all their devices
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
