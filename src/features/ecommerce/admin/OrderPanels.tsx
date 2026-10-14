'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { useDocumentInfo } from '@/engine/ui'

type Note = { id: string; type: 'internal' | 'customer'; text: string; author: string; createdAt: string }

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150, #ddd)', padding: 12, marginBottom: 12 }

function useOrderId(): string | null {
  const { id } = useDocumentInfo()
  return id ? String(id) : null
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || 'Request failed.')
  return body
}

export function OrderNotesPanel() {
  const id = useOrderId()
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [type, setType] = useState<'internal' | 'customer'>('internal')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!id) return
    try {
      setNotes((await call<{ notes: Note[] }>(`/api/admin-order-notes/${id}`)).notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notes.')
    }
  }, [id])
  useEffect(() => {
    if (!id) return
    call<{ notes: Note[] }>(`/api/admin-order-notes/${id}`)
      .then((r) => setNotes(r.notes))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load notes.'))
  }, [id])
  if (!id) return <p>Save the order first to add notes.</p>
  const add = async () => {
    setBusy(true); setError('')
    try {
      await call(`/api/admin-order-notes/${id}`, { method: 'POST', body: JSON.stringify({ text, type }) })
      setText(''); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.') } finally { setBusy(false) }
  }
  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      {notes.length === 0 && <p style={{ opacity: 0.7 }}>No notes yet.</p>}
      {[...notes].reverse().map((n) => (
        <div key={n.id} style={{ ...box, background: n.type === 'customer' ? 'var(--theme-success-50, #eef8ef)' : undefined }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{n.type === 'customer' ? 'Note to customer' : 'Internal note'} - {n.author} - {new Date(n.createdAt).toLocaleString()}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
        </div>
      ))}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="Add a note" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <select value={type} onChange={(e) => setType(e.target.value as 'internal' | 'customer')}>
          <option value="internal">Internal note</option>
          <option value="customer">Note to customer (emailed)</option>
        </select>
        <button type="button" className="btn btn--style-secondary" disabled={busy || !text.trim()} onClick={add}>Add note</button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}

export { OrderRefundsPanel } from './OrderRefundsPanel'

export function OrderInvoicePanel() {
  const id = useOrderId()
  if (!id) return <p>Save the order first.</p>
  return (
    <div className="field-type" style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
      <a className="btn btn--style-secondary" href={`/api/admin-order-invoice/${id}`} target="_blank" rel="noopener">View / print invoice</a>
      <a className="btn btn--style-secondary" href={`/api/admin-order-packing-slip/${id}`} target="_blank" rel="noopener">View / print packing slip</a>
    </div>
  )
}

type LabelInfo = {
  carriers: { id: string; label: string; labels: boolean }[]
  chosen: { carrier: string; serviceCode: string } | null
  shipments: { id?: string; carrier?: string; service?: string; trackingNumber?: string; labelUrl?: string; manifestId?: string | number | null }[]
}

export function OrderShippingPanel() {
  const id = useOrderId()
  const [info, setInfo] = useState<LabelInfo | null>(null)
  const [carrier, setCarrier] = useState('')
  const [service, setService] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!id) return
    call<LabelInfo>(`/api/admin-order-label/${id}`)
      .then((r) => {
        setInfo(r)
        setCarrier(r.chosen?.carrier ?? r.carriers[0]?.id ?? '')
        setService(r.chosen?.serviceCode ?? '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load shipping.'))
  }, [id])
  if (!id) return <p>Save the order first.</p>
  const buy = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await call<{ emailed: boolean }>(`/api/admin-order-label/${id}`, { method: 'POST', body: JSON.stringify({ carrier, serviceCode: service }) })
      setNotice(r.emailed ? 'Label bought. The customer was emailed their tracking number.' : 'Label bought.')
      window.location.reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.') } finally { setBusy(false) }
  }
  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      {info?.shipments.map((s, i) => (
        <div key={s.id ?? i} style={box}>
          {s.carrier} {s.service ? `- ${s.service}` : ''} - <strong>{s.trackingNumber}</strong>
          {s.labelUrl ? <> - <a href={s.labelUrl} target="_blank" rel="noopener noreferrer">Open label</a></> : null}
          {s.manifestId ? ' - on a manifest' : ''}
        </div>
      ))}
      {info && info.carriers.length === 0 && <p>No carrier is switched on. Add one in Shop settings &gt; Shipping, or type the tracking number into the fields beside this order.</p>}
      {info && info.carriers.length > 0 && (
        <div style={box}>
          <label>Carrier{' '}
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {info.carriers.map((c) => <option key={c.id} value={c.id}>{c.label}{c.labels ? '' : ' (labels not built in)'}</option>)}
            </select>
          </label>{' '}
          <label>Service code <input type="text" value={service} onChange={(e) => setService(e.target.value)} placeholder="from the carrier" /></label>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--style-secondary" disabled={busy || !carrier || !service} onClick={buy}>Buy label</button>
          </div>
          {info.chosen && <p style={{ marginTop: 8 }}>The customer chose {info.chosen.carrier} / {info.chosen.serviceCode} at checkout.</p>}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}
