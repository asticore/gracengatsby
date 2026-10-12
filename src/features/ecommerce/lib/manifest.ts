import { formatWeight, type UnitSystem } from './units'
import { escapeHtml } from './invoice'

/**
 * Driver manifest / pick list: one page (or CSV) listing every labelled order in a batch - who it
 * goes to, what is in the box, how heavy it is, the tracking number as a barcode, and a signature
 * column for the driver. Pure: callers load the orders; nothing here touches the database.
 */

export type ShipmentRecord = {
  id?: string
  carrier?: string
  service?: string
  trackingNumber?: string
  labelUrl?: string
  weightKg?: number
  createdAt?: string
  manifestId?: string | number | null
}

export type ManifestOrder = {
  id: number | string
  orderNumber?: string | null
  shippingAddress?: Record<string, unknown> | null
  customerEmail?: string | null
  lineItems?: { name?: string; sku?: string | null; quantity?: number }[] | null
  shipments?: ShipmentRecord[] | null
  trackingNumber?: string | null
  trackingCarrier?: string | null
  weightKg?: number | null
}

export type ManifestRow = {
  orderId: string
  orderNumber: string
  recipient: string
  phone: string
  addressLines: string[]
  items: { name: string; sku: string; quantity: number }[]
  weightKg: number
  carrier: string
  service: string
  trackingNumber: string
}

export type Manifest = {
  number: string
  date: string
  carrier: string
  rows: ManifestRow[]
  totals: { orders: number; parcels: number; items: number; weightKg: number }
}

const s = (a: Record<string, unknown> | null | undefined, k: string): string => (typeof a?.[k] === 'string' ? (a[k] as string).trim() : '')

/** The shipments of an order that have not been put on a manifest yet. */
export const unmanifested = (order: ManifestOrder): ShipmentRecord[] => (order.shipments ?? []).filter((x) => x.trackingNumber && (x.manifestId == null || x.manifestId === ''))

/**
 * Builds the manifest rows. One row per parcel (shipment). `onlyUnmanifested` leaves out parcels
 * already on an earlier manifest; `carrier` limits the batch to one carrier (a driver collects for
 * one carrier at a time).
 */
export function buildManifest(orders: ManifestOrder[], opts: { number: string; date: string; carrier?: string; onlyUnmanifested?: boolean; itemWeightKg?: (order: ManifestOrder) => number }): Manifest {
  const rows: ManifestRow[] = []
  for (const order of orders) {
    const shipments = opts.onlyUnmanifested === false ? (order.shipments ?? []).filter((x) => x.trackingNumber) : unmanifested(order)
    const a = order.shippingAddress
    const recipient = [s(a, 'firstName'), s(a, 'lastName')].filter(Boolean).join(' ') || s(a, 'company') || String(order.customerEmail ?? '')
    const addressLines = [s(a, 'company'), s(a, 'addressLine1'), s(a, 'addressLine2'), [s(a, 'city'), s(a, 'state'), s(a, 'postalCode')].filter(Boolean).join(' '), s(a, 'country')].filter(Boolean)
    for (const sh of shipments) {
      if (opts.carrier && sh.carrier !== opts.carrier) continue
      rows.push({
        orderId: String(order.id),
        orderNumber: order.orderNumber || String(order.id),
        recipient,
        phone: s(a, 'phone'),
        addressLines,
        items: (order.lineItems ?? []).map((l) => ({ name: l.name ?? '', sku: l.sku ?? '', quantity: l.quantity ?? 0 })),
        weightKg: typeof sh.weightKg === 'number' ? sh.weightKg : (opts.itemWeightKg?.(order) ?? order.weightKg ?? 0),
        carrier: sh.carrier ?? '',
        service: sh.service ?? '',
        trackingNumber: sh.trackingNumber ?? '',
      })
    }
  }
  const items = rows.reduce((n, r) => n + r.items.reduce((m, i) => m + i.quantity, 0), 0)
  return {
    number: opts.number,
    date: opts.date,
    carrier: opts.carrier ?? '',
    rows,
    totals: { orders: new Set(rows.map((r) => r.orderId)).size, parcels: rows.length, items, weightKg: Math.round(rows.reduce((w, r) => w + r.weightKg, 0) * 1000) / 1000 },
  }
}

/* ------------------------------ Code 39 barcode ------------------------------ */

// n = narrow, w = wide; bars and spaces alternate starting with a bar. Nine elements per character.
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
}

export const code39Patterns = CODE39

/** The text a Code 39 barcode can carry: upper-case, only its alphabet, never the `*` start/stop. */
export const code39Text = (value: string): string => value.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '')

/** Inline SVG barcode for a tracking number. Empty string when nothing can be encoded. */
export function code39Svg(value: string, opts: { height?: number; narrow?: number } = {}): string {
  const text = code39Text(value)
  if (!text) return ''
  const narrow = opts.narrow ?? 1.6
  const wide = narrow * 2.5
  const height = opts.height ?? 38
  const chars = `*${text}*`
  let x = 0
  const rects: string[] = []
  for (const ch of chars) {
    const pattern = CODE39[ch]
    for (let i = 0; i < 9; i += 1) {
      const w = pattern[i] === 'w' ? wide : narrow
      if (i % 2 === 0) rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`)
      x += w
    }
    x += narrow // inter-character gap
  }
  const total = Math.ceil(x)
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${escapeHtml(text)}" width="${total}" height="${height}" viewBox="0 0 ${total} ${height}" fill="#000">${rects.join('')}</svg>`
}

/* ---------------------------------- Output ---------------------------------- */

const CSS = `
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font: 12px/1.35 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 0; padding: 16px; }
h1 { font-size: 20px; margin: 0 0 2px; }
.muted { color: #555; }
.meta { display: flex; gap: 24px; flex-wrap: wrap; margin: 8px 0 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 8px; border: 1px solid #bbb; vertical-align: top; }
th { background: #eee; }
td.num, th.num { text-align: right; white-space: nowrap; }
td.sig { width: 150px; }
.code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; letter-spacing: 1px; }
.addr div { white-space: nowrap; }
tr { page-break-inside: avoid; }
.print { margin-bottom: 12px; }
@media print { .print { display: none; } body { padding: 0; } }
`

export function renderManifestHtml(manifest: Manifest, opts: { storeName: string; unitSystem: UnitSystem }): string {
  const rows = manifest.rows
    .map(
      (r, i) => `<tr>
<td class="num">${i + 1}</td>
<td>#${escapeHtml(r.orderNumber)}</td>
<td><strong>${escapeHtml(r.recipient)}</strong>${r.phone ? `<div class="muted">${escapeHtml(r.phone)}</div>` : ''}</td>
<td class="addr">${r.addressLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</td>
<td>${r.items.map((it) => `<div>${escapeHtml(it.quantity)} x ${escapeHtml(it.name)}${it.sku ? ` <span class="muted">(${escapeHtml(it.sku)})</span>` : ''}</div>`).join('')}</td>
<td class="num">${escapeHtml(formatWeight(r.weightKg, opts.unitSystem))}</td>
<td>${code39Svg(r.trackingNumber)}<div class="code">${escapeHtml(r.trackingNumber)}</div><div class="muted">${escapeHtml(r.carrier)}${r.service ? ` - ${escapeHtml(r.service)}` : ''}</div></td>
<td class="sig"></td>
</tr>`,
    )
    .join('')
  const body = `<div class="print"><button onclick="window.print()">Print</button></div>
<h1>Driver manifest ${escapeHtml(manifest.number)}</h1>
<div class="muted">${escapeHtml(opts.storeName)}</div>
<div class="meta"><span>Date: <strong>${escapeHtml(manifest.date)}</strong></span>${manifest.carrier ? `<span>Carrier: <strong>${escapeHtml(manifest.carrier)}</strong></span>` : ''}<span>Orders: <strong>${manifest.totals.orders}</strong></span><span>Parcels: <strong>${manifest.totals.parcels}</strong></span><span>Items: <strong>${manifest.totals.items}</strong></span><span>Total weight: <strong>${escapeHtml(formatWeight(manifest.totals.weightKg, opts.unitSystem))}</strong></span></div>
<table><thead><tr><th class="num">#</th><th>Order</th><th>Recipient</th><th>Address</th><th>Items</th><th class="num">Weight</th><th>Tracking</th><th>Signature</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">Driver: ______________________ &nbsp; Parcels collected: ______ &nbsp; Time: ______ &nbsp; Signature: ______________________</p>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Manifest ${escapeHtml(manifest.number)}</title><style>${CSS}</style></head><body>${body}</body></html>`
}

/** A cell that cannot start a spreadsheet formula (CSV injection) and is quoted when needed. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function manifestCsv(manifest: Manifest): string {
  const header = ['Manifest', 'Date', 'Order', 'Recipient', 'Phone', 'Address', 'Items', 'Weight kg', 'Carrier', 'Service', 'Tracking number']
  const lines = [header.join(',')]
  for (const r of manifest.rows) {
    lines.push(
      [
        manifest.number,
        manifest.date,
        r.orderNumber,
        r.recipient,
        r.phone,
        r.addressLines.join(', '),
        r.items.map((i) => `${i.quantity} x ${i.name}`).join('; '),
        r.weightKg,
        r.carrier,
        r.service,
        r.trackingNumber,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}
