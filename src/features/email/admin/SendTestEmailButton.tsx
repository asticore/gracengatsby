'use client'

import React, { useState } from 'react'
import { useFormFields, useFormModified } from '@payloadcms/ui'

type TestResult = {
  ok?: boolean
  error?: string
  to?: string
  provider?: string
  status?: number
}

/**
 * The "Send test email" control on the Email settings screen.
 *
 * It deliberately reports the provider's own words on failure rather than a
 * tidied-up message: "domain not verified" or "invalid API key" is what tells
 * an operator what to fix, and a generic "sending failed" tells them nothing.
 *
 * The send reads the SAVED settings, not what is currently typed into the form,
 * so the button stays disabled while there are unsaved changes - otherwise a
 * test would silently exercise the previous key and pass or fail for the wrong
 * reason.
 */
export const SendTestEmailButton: React.FC = () => {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const recipient = useFormFields(([fields]) => fields?.['testing.testRecipient']?.value as string | undefined)
  const modified = useFormModified()

  const send = async () => {
    setSending(true)
    setResult(null)
    try {
      const response = await fetch('/api/internal-email-test', {
        method: 'POST',
        credentials: 'include',
      })
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
      <button
        type="button"
        onClick={send}
        disabled={sending || modified}
        className="btn btn--style-secondary"
        style={{ margin: 0 }}
      >
        {sending ? 'Sending…' : 'Send test email'}
      </button>

      {modified && (
        <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.75 }}>
          Save your changes first - the test uses the saved settings.
        </p>
      )}

      {result && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            lineHeight: 1.5,
            color: result.ok ? '#1a7f37' : '#b3261e',
          }}
        >
          {result.ok
            ? `Sent to ${result.to ?? recipient ?? 'the test recipient'}. Check the inbox, and the spam folder if nothing arrives.`
            : `Not sent: ${result.error ?? 'the provider gave no reason.'}`}
        </p>
      )}
    </div>
  )
}

export default SendTestEmailButton
