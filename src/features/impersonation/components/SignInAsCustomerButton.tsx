'use client'

import { useId, useRef, useState, type FormEvent } from 'react'

import { startImpersonationAction } from '../actions'

/**
 * The "Sign in as" button on an admin user's edit screen. It opens a confirm
 * dialog that asks for the reason and a fresh password or authenticator code,
 * then calls the same start action the Impersonation screen uses. The server
 * checks the admin, the customer, the reason and the proof again; the dialog
 * only collects them.
 */

type Props = { email: string; maxMinutes: number }

export function SignInAsCustomerButton({ email, maxMinutes }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()

  const open = () => {
    setMessage(null)
    dialogRef.current?.showModal()
  }

  const close = () => {
    if (!busy) dialogRef.current?.close()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage(null)
    const result = await startImpersonationAction({
      email,
      reason: String(form.get('reason') ?? ''),
      password: String(form.get('password') ?? '') || undefined,
      code: String(form.get('code') ?? '') || undefined,
    })
    if (result.ok && result.redirectTo) {
      window.location.assign(result.redirectTo)
      return
    }
    setBusy(false)
    setMessage(result.message)
  }

  return (
    <>
      <button type="button" onClick={open}>
        Sign in as
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} style={{ maxWidth: 480, width: '90vw' }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
          <h2 id={titleId}>Sign in as {email}?</h2>
          <p>
            You will see the site as this customer for up to {maxMinutes} minutes. Changes you make are made on their account. Every start and stop is
            recorded.
          </p>
          <label style={{ display: 'grid', gap: 4 }}>
            Reason (at least 5 characters)
            <textarea name="reason" required minLength={5} maxLength={300} rows={2} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            Your password
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            Or your authenticator code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" />
          </label>
          {message ? <p role="alert">{message}</p> : null}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Starting...' : 'Sign in as customer'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
