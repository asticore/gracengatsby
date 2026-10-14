'use client'

import { useState } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import './cache-tools.css'

type Tone = 'ok' | 'error'

type Notice = { tone: Tone; text: string } | null

type DevModeState = { value: 'on' | 'off' | null; minutes: number | null }

type ClearResponse = { ok?: boolean; error?: string; cloudflare?: { ran?: boolean; errors?: string[] } }

type DevModeResponse = { ok?: boolean; message?: string; value?: 'on' | 'off' | null; minutesRemaining?: number | null }

/**
 * The two cache tools on /admin/cache-tools. Each button calls its own route
 * and shows the plain-English result underneath. Nothing runs on page load.
 */
export function CacheToolsClient() {
  const [busy, setBusy] = useState<string | null>(null)
  const [clearNotice, setClearNotice] = useState<Notice>(null)
  const [devNotice, setDevNotice] = useState<Notice>(null)
  const [devState, setDevState] = useState<DevModeState>({ value: null, minutes: null })

  const clearCache = async () => {
    setBusy('clear')
    setClearNotice(null)
    try {
      const response = await fetch('/api/admin-cache-clear', { method: 'POST', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as ClearResponse
      if (response.ok && body.ok) {
        const cloudflareNote = body.cloudflare?.ran
          ? ' Cloudflare was asked to clear its copies too.'
          : ''
        setClearNotice({ tone: 'ok', text: `Saved copies cleared. Visitors see the latest pages within about 10 seconds.${cloudflareNote}` })
      } else {
        const errors = body.cloudflare?.errors?.join(' ') || ''
        setClearNotice({ tone: 'error', text: [body.error || 'The cache could not be cleared.', errors].filter(Boolean).join(' ') })
      }
    } catch {
      setClearNotice({ tone: 'error', text: 'The cache could not be cleared. Check the connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const applyDevResponse = (body: DevModeResponse) => {
    setDevState({ value: body.value ?? null, minutes: body.minutesRemaining ?? null })
    setDevNotice({ tone: body.ok ? 'ok' : 'error', text: body.message || 'Development mode could not be read.' })
  }

  const checkDevMode = async () => {
    setBusy('check')
    setDevNotice(null)
    try {
      const response = await fetch('/api/admin-cloudflare-dev-mode', { credentials: 'include' })
      applyDevResponse((await response.json().catch(() => ({}))) as DevModeResponse)
    } catch {
      setDevNotice({ tone: 'error', text: 'Development mode could not be read. Check the connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const setDevMode = async (value: 'on' | 'off') => {
    setBusy(value)
    setDevNotice(null)
    try {
      const response = await fetch('/api/admin-cloudflare-dev-mode', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      applyDevResponse((await response.json().catch(() => ({}))) as DevModeResponse)
    } catch {
      setDevNotice({ tone: 'error', text: 'Development mode could not be changed. Check the connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const devLabel = devState.value === 'on' ? 'Development mode is on' : devState.value === 'off' ? 'Development mode is off' : 'Development mode: not checked yet'

  return (
    <div className="cache-tools">
      <CollapsibleCard id="cache-tools-clear" title="Clear saved copies">
        <p className="cache-tools__text">
          Ignores every saved copy of your pages from now on, so the next visitor gets a freshly built page. Publishing does this
          automatically when page caching is on.
        </p>
        <button type="button" className="btn btn--style-secondary cache-tools__button" disabled={busy !== null} onClick={clearCache}>
          {busy === 'clear' ? 'Clearing...' : 'Clear cache now'}
        </button>
        {clearNotice && <p role="status" className={`cache-tools__notice cache-tools__notice--${clearNotice.tone}`}>{clearNotice.text}</p>}
      </CollapsibleCard>

      <CollapsibleCard id="cache-tools-dev" title="Cloudflare development mode">
        <p className="cache-tools__text">
          While development mode is on, Cloudflare does not keep its own copies, so every change shows at once. It turns itself off after
          three hours. Leave it on only while you are actively editing.
        </p>
        <p className="cache-tools__status">
          {devLabel}
          {devState.value === 'on' && devState.minutes !== null ? ` (about ${devState.minutes} minutes left)` : ''}
        </p>
        <button type="button" className="btn btn--style-secondary cache-tools__button" disabled={busy !== null} onClick={checkDevMode}>
          {busy === 'check' ? 'Checking...' : 'Check development mode'}
        </button>
        <button type="button" className="btn btn--style-secondary cache-tools__button" disabled={busy !== null} onClick={() => setDevMode('on')}>
          {busy === 'on' ? 'Turning on...' : 'Turn development mode on'}
        </button>
        <button type="button" className="btn btn--style-secondary cache-tools__button" disabled={busy !== null} onClick={() => setDevMode('off')}>
          {busy === 'off' ? 'Turning off...' : 'Turn development mode off'}
        </button>
        {devNotice && <p role="status" className={`cache-tools__notice cache-tools__notice--${devNotice.tone}`}>{devNotice.text}</p>}
      </CollapsibleCard>
    </div>
  )
}
