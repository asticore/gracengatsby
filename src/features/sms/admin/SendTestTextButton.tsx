'use client'

import React, { useState } from 'react'
import { useFormModified } from '@/engine/ui'

type TestResult = {
  ok?: boolean
  error?: string
  to?: string
}

/**
 * The "Send test text" control on the Integrations page, next to the test phone
 * number. Like the email test it uses the SAVED settings, so it stays disabled
 * while there are unsaved changes.
 */
export const SendTestTextButton: React.FC = () => {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const modified = useFormModified()

  const send = async () => {
    setSending(true)
    setResult(null)
    try {
      const response = await fetch('/api/internal-sms-test', { method: 'POST', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as TestResult
      setResult(
        response.ok
          ? body
          : { ok: false, error: body.error || 'The test could not be run. Are you still signed in as an admin?' },
      )
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <button type="button" onClick={send} disabled={sending || modified} className="btn btn--style-secondary" style={{ margin: 0 }}>
        {sending ? 'Sending...' : 'Send test text'}
      </button>

      {modified && (
        <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.75 }}>
          Save your changes first - the test uses the saved settings.
        </p>
      )}

      {result && (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: result.ok ? '#1a7f37' : '#b3261e' }}>
          {result.ok
            ? `Text sent to ${result.to ?? 'the test number'}.`
            : `Not sent: ${result.error ?? 'the provider gave no reason.'}`}
        </p>
      )}
    </div>
  )
}

export default SendTestTextButton
