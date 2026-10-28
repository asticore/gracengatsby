'use client'

import React, { useState } from 'react'

import { usePortalText } from '@/features/multilingual/PortalTextProvider'

import { signInWithPasskey } from '../client'

/**
 * "Sign in with a passkey". Shown only when the server says passkeys are on for this
 * screen. On success the browser follows the server's redirect; when the account also
 * needs a two-step code, the pending token is handed to the code step instead.
 */
export const PasskeySignInButton: React.FC<{ next: string; area?: 'account' | 'admin'; onTwoFactor?: (pendingToken: string) => void }> = ({
  next,
  area = 'account',
  onTwoFactor,
}) => {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const tx = usePortalText()

  const go = async () => {
    setBusy(true)
    setMessage('')
    const result = await signInWithPasskey(next, area)
    if (result.redirect) {
      window.location.assign(result.redirect)
      return
    }
    if (result.twoFactorRequired && result.pendingToken && onTwoFactor) {
      onTwoFactor(result.pendingToken)
      setBusy(false)
      return
    }
    setMessage(result.message || tx('common.passkeyFailed'))
    setBusy(false)
  }

  return (
    <div className="account-passkey">
      <button type="button" className="account-button account-button--secondary" onClick={go} disabled={busy}>
        {busy ? tx('common.waitingDevice') : tx('common.signInWithPasskey')}
      </button>
      {message && (
        <p className="account-note account-note--error" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
