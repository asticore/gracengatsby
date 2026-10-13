'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { PublicFormConfig, SubmissionValues } from '../types'

import { readResumeToken } from '../drafts'
import { HONEYPOT_FIELD } from '../spam'
import './saveForLater.css'

/**
 * "Save and continue later": a link under the form. The visitor types an email, the server emails
 * them a link, and opening that link brings the saved answers back (see features/forms/drafts.ts).
 *
 * Shown only when the form allows it and it has more than one question. Opened from a resume link,
 * it fetches the saved answers once and hands them to the renderer through onRestore.
 * It sits outside the form element's submit path: pressing Enter in its email box never submits the form.
 */

type Phase = 'idle' | 'sending' | 'sent' | 'error'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SaveForLater: React.FC<{
  config: PublicFormConfig
  values: SubmissionValues
  page: number
  onRestore: (values: SubmissionValues, page: number) => void
}> = ({ config, values, page, onRestore }) => {
  const named = useMemo(() => (config.fields || []).filter((field) => field.name).length, [config.fields])
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)
  const restoreRef = useRef(onRestore)
  const configRef = useRef(config)

  useEffect(() => {
    restoreRef.current = onRestore
    configRef.current = config
  }, [onRestore, config])

  const enabled = Boolean(config.saveForLater) && named > 1
  const base = (config.apiBase || '').replace(/\/$/, '')
  const formParam = encodeURIComponent(config.key || String(config.id))

  // Opened from an emailed link: bring the saved answers back, once.
  useEffect(() => {
    if (started.current || !enabled) return
    started.current = true
    const token = readResumeToken(window.location.search)
    if (!token) return
    const current = configRef.current
    const url = `${base}/api/form-draft?form=${formParam}`
    void (async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form: current.key || current.id, token }),
        })
        const body = (await response.json().catch((): null => null)) as { ok?: boolean; values?: SubmissionValues; page?: number; message?: string } | null
        if (!response.ok || !body?.ok) {
          setPhase('error')
          setMessage(body?.message || 'This link has expired or is not valid. Please start the form again.')
          return
        }
        restoreRef.current(body.values || {}, Number(body.page) || 0)
        setMessage('Welcome back. Your answers are filled in. Pick up where you left off.')
      } catch {
        setPhase('error')
        setMessage('We could not load your saved answers. Please try again in a moment.')
      }
    })()
  }, [enabled, base, formParam])

  if (!enabled) return null

  const send = async () => {
    const address = email.trim()
    if (!EMAIL_SHAPE.test(address)) {
      setPhase('error')
      setMessage('Enter a valid email address.')
      return
    }
    setPhase('sending')
    setMessage(null)
    // The page the visitor is on, so the link brings them back to it. Not sent from an embed (the server then uses the embed page).
    const embedded = window.self !== window.top
    try {
      const response = await fetch(`${base}/api/form-draft?form=${formParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: config.key || config.id,
          email: address,
          data: values,
          page,
          pageUrl: embedded ? undefined : window.location.href,
          [HONEYPOT_FIELD]: '',
        }),
      })
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; message?: string; errors?: Record<string, string> } | null
      if (!response.ok || !body?.ok) {
        setPhase('error')
        setMessage(body?.errors?.email || body?.message || 'Your progress could not be saved. Please try again.')
        return
      }
      setPhase('sent')
      setMessage(body.message || 'We have emailed you a link to finish this form.')
    } catch {
      setPhase('error')
      setMessage('Your progress could not be saved. Please try again.')
    }
  }

  return (
    <div className="engage-save-later" aria-live="polite">
      {!open && phase !== 'sent' && (
        <button type="button" className="engage-save-later__toggle" onClick={() => setOpen(true)}>
          Save and continue later
        </button>
      )}
      {open && phase !== 'sent' && (
        <div className="engage-save-later__panel">
          <label htmlFor={`save-later-${config.id}`}>Email me a link to finish this form</label>
          <input
            id={`save-later-${config.id}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void send()
              }
            }}
          />
          <div>
            <button type="button" className="btn" onClick={() => void send()} disabled={phase === 'sending'}>
              {phase === 'sending' ? 'Saving...' : 'Email me the link'}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={phase === 'error' ? 'form-error engage-save-later__note' : 'engage-save-later__note'} role={phase === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
    </div>
  )
}
