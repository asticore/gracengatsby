import { formatCents } from './money'

/** Escapes text for safe use in HTML text and double-quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type InvoiceOrder = {
  id: number | string
  createdAt?: string | null
  paidAt?: string | null
  status?: string | null
  currency?: string | null
  customerEmail?: string | null
  customerNote?: string | null
  shippingAddress?: Record<string, unknown> | null
  lineItems?: { name?: string; sku?: string | null; quantity?: number; unitCents?: number; lineCents?: number; discountCents?: number }[] | null
  subtotal?: number | null
  discountTotal?: number | null
  shippingTotal?: number | null
  taxTotal?: number | null
  refundedTotal?: number | null
  amount?: number | null
  pricesIncludeTax?: boolean | null
  taxLines?: { name?: string; ratePct?: number; taxCents?: number }[] | null
  couponLines?: { code?: string; discountCents?: number }[] | null
  shippingMethod?: { title?: string } | null
  checkoutFields?: Record<string, { label?: string; value?: string }> | null
}

export type InvoiceStore = { name: string; abn?: string | null; address?: string | null; email?: string | null }

const CSS = `
@page { size: A4; margin: 16mm; }
* { box-sizing: border-box; }
body { font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 0; padding: 24px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.muted { color: #555; }
.head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
th.num, td.num { text-align: right; white-space: nowrap; }
.totals { margin-left: auto; width: 320px; }
.totals td { border: 0; padding: 3px 8px; }
.totals tr.grand td { border-top: 2px solid #111; font-weight: 700; }
.addr { white-space: pre-line; }
.print { margin-bottom: 16px; }
@media print { .print { display: none; } body { padding: 0; } }
`

const addressLines = (a: Record<string, unknown> | null | undefined): string => {
  if (!a) return ''
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '')
  const name = [s('firstName'), s('lastName')].filter(Boolean).join(' ')
  const cityLine = [s('city'), s('state'), s('postalCode')].filter(Boolean).join(' ')
  return [name, s('company'), s('addressLine1'), s('addressLine2'), cityLine, s('country'), s('phone')].filter(Boolean).map(escapeHtml).join('\n')
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><div class="print"><button onclick="window.print()">Print</button></div>${body}</body></html>`
}

const dateStr = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }) : '')

/** True when the order carries GST, which makes the invoice a "Tax invoice". */
export const hasGst = (order: InvoiceOrder): boolean =>
  (order.taxLines ?? []).some((t) => (t.taxCents ?? 0) > 0 && /gst/i.test(t.name ?? '')) || (order.taxTotal ?? 0) > 0

/**
 * Printable invoice. Every dynamic value goes through `escapeHtml`, including
 * customer-entered fields and notes. When the order includes GST the
 * document is titled "Tax invoice" and carries the store's ABN.
 */
export function renderInvoiceHtml(order: InvoiceOrder, store: InvoiceStore): string {
  const cur = order.currency || 'AUD'
  const money = (n: number | null | undefined) => escapeHtml(formatCents(n ?? 0, cur))
  const gst = hasGst(order)
  const title = gst ? 'Tax invoice' : 'Invoice'
  const rows = (order.lineItems ?? [])
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}${l.sku ? `<div class="muted">SKU ${escapeHtml(l.sku)}</div>` : ''}</td><td class="num">${escapeHtml(l.quantity ?? 0)}</td><td class="num">${money(l.unitCents)}</td><td class="num">${money(l.lineCents ?? (l.unitCents ?? 0) * (l.quantity ?? 0))}</td></tr>`,
    )
    .join('')
  const taxRows = (order.taxLines ?? [])
    .map((t) => `<tr><td>${escapeHtml(t.name)} (${escapeHtml(t.ratePct)}%)${order.pricesIncludeTax ? ' included' : ''}</td><td class="num">${money(t.taxCents)}</td></tr>`)
    .join('')
  const coupons = (order.couponLines ?? []).map((c) => `<tr><td>Discount (${escapeHtml(c.code)})</td><td class="num">-${money(c.discountCents)}</td></tr>`).join('')
  const extra = Object.values(order.checkoutFields ?? {})
    .map((f) => `<div><span class="muted">${escapeHtml(f.label)}:</span> ${escapeHtml(f.value)}</div>`)
    .join('')
  const body = `
<div class="head">
  <div><h1>${escapeHtml(title)}</h1><div class="muted">Invoice ${escapeHtml(`INV-${String(order.id).padStart(5, '0')}`)} &middot; ${escapeHtml(dateStr(order.paidAt || order.createdAt))}</div>
  <div class="muted">Order #${escapeHtml(order.id)} &middot; ${escapeHtml(order.status)}</div></div>
  <div style="text-align:right"><strong>${escapeHtml(store.name)}</strong>${store.abn && gst ? `<div>ABN ${escapeHtml(store.abn)}</div>` : store.abn ? `<div class="muted">ABN ${escapeHtml(store.abn)}</div>` : ''}${store.address ? `<div class="addr muted">${escapeHtml(store.address)}</div>` : ''}${store.email ? `<div class="muted">${escapeHtml(store.email)}</div>` : ''}</div>
</div>
<div class="head"><div><strong>Bill / ship to</strong><div class="addr">${addressLines(order.shippingAddress)}</div>${order.customerEmail ? `<div class="muted">${escapeHtml(order.customerEmail)}</div>` : ''}</div><div>${extra}</div></div>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals"><tbody>
<tr><td>Subtotal</td><td class="num">${money(order.subtotal)}</td></tr>
${coupons}
${order.shippingMethod ? `<tr><td>Shipping (${escapeHtml(order.shippingMethod.title)})</td><td class="num">${money(order.shippingTotal)}</td></tr>` : ''}
${taxRows}
${(order.refundedTotal ?? 0) > 0 ? `<tr><td>Refunded</td><td class="num">-${money(order.refundedTotal)}</td></tr>` : ''}
<tr class="grand"><td>Total${gst && order.pricesIncludeTax ? ' (incl. GST)' : ''}</td><td class="num">${money(order.amount)}</td></tr>
</tbody></table>
${order.customerNote ? `<p><strong>Customer note</strong><br>${escapeHtml(order.customerNote)}</p>` : ''}`
  return page(`${title} ${order.id}`, body)
}

/** Packing slip: no prices, just what to put in the box and where it goes. */
export function renderPackingSlipHtml(order: InvoiceOrder, store: InvoiceStore): string {
  const rows = (order.lineItems ?? [])
    .map((l) => `<tr><td>${escapeHtml(l.name)}${l.sku ? `<div class="muted">SKU ${escapeHtml(l.sku)}</div>` : ''}</td><td class="num">${escapeHtml(l.quantity ?? 0)}</td></tr>`)
    .join('')
  const extra = Object.values(order.checkoutFields ?? {})
    .map((f) => `<div><span class="muted">${escapeHtml(f.label)}:</span> ${escapeHtml(f.value)}</div>`)
    .join('')
  const body = `
<div class="head"><div><h1>Packing slip</h1><div class="muted">Order #${escapeHtml(order.id)} &middot; ${escapeHtml(dateStr(order.createdAt))}</div></div><div style="text-align:right"><strong>${escapeHtml(store.name)}</strong></div></div>
<div class="head"><div><strong>Ship to</strong><div class="addr">${addressLines(order.shippingAddress)}</div></div><div>${order.shippingMethod ? `<div><span class="muted">Shipping:</span> ${escapeHtml(order.shippingMethod.title)}</div>` : ''}${extra}</div></div>
<table><thead><tr><th>Item</th><th class="num">Qty</th></tr></thead><tbody>${rows}</tbody></table>
${order.customerNote ? `<p><strong>Customer note</strong><br>${escapeHtml(order.customerNote)}</p>` : ''}`
  return page(`Packing slip ${order.id}`, body)
}
