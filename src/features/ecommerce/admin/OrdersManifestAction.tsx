'use client'

import React, { useEffect, useState } from 'react'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { OrdersManifestPicker } from './OrdersManifestPicker'

type Made = { number: string; totals: { orders: number; parcels: number }; htmlUrl: string; csvUrl: string }
type Options = { carriers: { id: string; label: string }[]; orders: { id: number; orderNumber: string; name: string }[] }

/** Orders list toolbar: batch every labelled parcel not yet on a manifest into one driver manifest. */
export function OrdersManifestAction() {
  const t = useAdminT()
  const [options, setOptions] = useState<Options>({ carriers: [], orders: [] })
  const [carrier, setCarrier] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<Made | null>(null)

  useEffect(() => {
    fetch('/api/admin-shop-manifest', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const loaded = body as Options | null
        if (loaded) setOptions(loaded)
      })
      .catch(() => setError('Could not load carriers and orders.'))
  }, [])

  const create = async () => {
    setBusy(true)
    setError('')
    setMade(null)
    try {
      // Ticked orders only. With none ticked, every labelled order not yet on a manifest goes in.
      const payload = picked.length > 0 ? { orderIds: picked, carrier } : { all: true, carrier }
      const res = await fetch('/api/admin-shop-manifest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json().catch((): null => null)) as (Made & { error?: string }) | null
      if (!res.ok || !body) setError(body?.error || 'Could not create the manifest.')
      else setMade(body)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="list-toolbar-manifest">
      <select value={carrier} onChange={(e) => setCarrier(e.target.value)} aria-label={t('orders.manifest.carrierLabel')} className="list-filter-value-input" title={t('orders.manifest.carrierTip')}>
        <option value="">{t('orders.manifest.allCarriers')}</option>
        {options.carriers.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <OrdersManifestPicker orders={options.orders} picked={picked} onChange={setPicked} />
      <button type="button" className="list-toolbar-btn" disabled={busy} onClick={create} title={t('orders.manifest.createTip')}>
        {busy ? t('orders.manifest.creating') : picked.length > 0 ? t('orders.manifest.createCount', { count: picked.length }) : t('orders.manifest.create')}
      </button>
      {made && (
        <span role="status">
          {made.number}: {made.totals.parcels} {t('orders.manifest.parcels')} -{' '}
          <a href={made.htmlUrl} target="_blank" rel="noopener noreferrer">{t('orders.manifest.print')}</a> | <a href={made.csvUrl}>CSV</a>
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  )
}
