'use client'

import React, { useEffect, useState } from 'react'

import '@/features/shopReports/shop-reports.css'

type ApiRow = { code: string; enabled: boolean; rateMode: 'manual' | 'auto'; manualRate: number | null; autoRate: number | null; autoRateAt: string | null; shownRate: number | null }
type Loaded = { base: string; attribution: string; maxCurrencies: number; currencies: ApiRow[] }
type Draft = { code: string; enabled: boolean; rateMode: 'manual' | 'auto'; manualRate: string }

const toDraft = (r: ApiRow): Draft => ({ code: r.code, enabled: r.enabled, rateMode: r.rateMode, manualRate: r.manualRate === null ? '' : String(r.manualRate) })

/** The list of extra display currencies: which ones shoppers can pick, and how their rates are set. */
export function DisplayCurrenciesPanel() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [newCode, setNewCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin-display-currencies', { credentials: 'include' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Loaded & { error?: string }
        if (cancelled) return
        if (!res.ok || body.error) {
          setLoadError(body.error || 'The list could not be loaded.')
          return
        }
        setLoaded(body)
        setDrafts(body.currencies.map(toDraft))
        setLoadError('')
      })
      .catch(() => {
        if (!cancelled) setLoadError('The list could not be loaded. Check the connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const base = loaded?.base ?? 'AUD'
  const update = (i: number, patch: Partial<Draft>) => setDrafts((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const move = (i: number, by: number) =>
    setDrafts((d) => {
      const j = i + by
      if (j < 0 || j >= d.length) return d
      const next = [...d]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const add = () => {
    const code = newCode.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) return setMessage('Currency codes are three letters, such as USD or EUR.')
    if (code === base) return setMessage(`${code} is already the shop currency.`)
    if (drafts.some((d) => d.code === code)) return setMessage(`${code} is already listed.`)
    setDrafts((d) => [...d, { code, enabled: true, rateMode: 'auto', manualRate: '' }])
    setNewCode('')
    setMessage('')
  }

  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin-display-currencies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currencies: drafts.map((d) => ({ code: d.code, enabled: d.enabled, rateMode: d.rateMode, manualRate: d.manualRate === '' ? null : d.manualRate })) }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setMessage(body.error || 'The list could not be saved.')
      else {
        setMessage('Saved. Shoppers will see the new list straight away.')
        setReloadKey((k) => k + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin-display-currencies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; refreshed?: string[]; missing?: string[] }
      if (!res.ok) setMessage(body.error || 'The automatic rates could not be fetched.')
      else {
        const missing = body.missing && body.missing.length ? ` The service had no rate for: ${body.missing.join(', ')}.` : ''
        setMessage(`Automatic rates updated for ${body.refreshed?.length ?? 0} currenc${body.refreshed?.length === 1 ? 'y' : 'ies'}.${missing}`)
        setReloadKey((k) => k + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="shop-reports__error">{loadError}</p>
  if (!loaded) return <p>Loading...</p>

  return (
    <div className="field-type" style={{ display: 'grid', gap: 16 }}>
      <p>
        The shop currency is <strong>{base}</strong>. Prices are shown in the other currencies as approximate amounts. Checkout always charges {base}, and the shopper is told so.
      </p>

      {drafts.length === 0 ? <p>No display currencies yet. Add one below. Until then, shoppers see prices in {base} only.</p> : null}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        {drafts.map((d, i) => {
          const saved = loaded.currencies.find((c) => c.code === d.code)
          return (
            <li key={d.code} style={{ border: '1px solid var(--theme-elevation-150, #ddd)', padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{d.code}</strong>
                <label>
                  <input type="checkbox" checked={d.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} /> Show to shoppers
                </label>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${d.code} up`}>
                  Up
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === drafts.length - 1} aria-label={`Move ${d.code} down`}>
                  Down
                </button>
                <button type="button" onClick={() => setDrafts((rows) => rows.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span>Rate source</span>
                  <select value={d.rateMode} onChange={(e) => update(i, { rateMode: e.target.value === 'auto' ? 'auto' : 'manual' })}>
                    <option value="auto">Automatic (updated about once a day)</option>
                    <option value="manual">Type it in myself</option>
                  </select>
                </label>
                {d.rateMode === 'manual' ? (
                  <label style={{ display: 'grid', gap: 4 }} title={`How many ${d.code} one ${base} is worth. For example, 0.66 means 10 ${base} shows as 6.60 ${d.code}.`}>
                    <span>
                      {d.code} for 1 {base}
                    </span>
                    <input type="number" min="0" step="any" value={d.manualRate} onChange={(e) => update(i, { manualRate: e.target.value })} />
                  </label>
                ) : null}
                <span className="shop-reports__range" title="The exchange rate shoppers see right now.">
                  {saved && saved.shownRate !== null ? `Rate in use: 1 ${base} = ${saved.shownRate} ${d.code}` : 'No rate yet. Save, then fetch automatic rates, or type a rate.'}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" maxLength={3} placeholder="Add a code, e.g. USD" value={newCode} onChange={(e) => setNewCode(e.target.value)} aria-label="Currency code to add" />
        <button type="button" onClick={add} disabled={drafts.length >= loaded.maxCurrencies}>
          Add currency
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy}>
          Save list
        </button>
        <button type="button" onClick={refresh} disabled={busy || !drafts.some((d) => d.rateMode === 'auto')} title="Fetch the automatic rates now instead of waiting for the daily update.">
          Fetch automatic rates now
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <p className="shop-reports__range">{loaded.attribution}. Converted amounts are estimates and are rounded for display only.</p>
    </div>
  )
}
