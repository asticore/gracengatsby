import { PAID_STATUSES } from '../lib/orderStatus'
import { buildManifest, type Manifest, type ManifestOrder, type ShipmentRecord } from '../lib/manifest'
import { carrierDef } from '../shipping/catalogue'
import { packItems } from '../shipping/packing'
import { getAdapter, normaliseShippingConfig, parseLiveOptionId } from '../shipping/registry'
import type { CarrierId } from '../shipping/types'
import { sendOrderEmail } from './emails'

type Doc = Record<string, unknown>
export type ShipEngine = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findByID: (a: unknown) => Promise<Doc | null>
  findGlobal: (a: unknown) => Promise<Doc>
  create: (a: unknown) => Promise<Doc>
  update: (a: unknown) => Promise<Doc>
}

export class ShipmentError extends Error {}

const idOf = (v: unknown): number | string | null => (v && typeof v === 'object' ? ((v as Doc).id as number | string) : (v as number | string | null)) ?? null

/** Which carrier + service the customer chose at checkout (`live:<carrier>:<service>`), if any. */
export function chosenService(order: Doc): { carrier: string; serviceCode: string } | null {
  const m = order.shippingMethod as { id?: string } | null | undefined
  return parseLiveOptionId(m?.id ?? null)
}

/**
 * Buys a label for an order with its carrier, appends it to `shipments`, stores the tracking number on
 * the order and sends the shipped email. Throws ShipmentError with a plain-English message.
 */
export async function buyLabel(engine: ShipEngine, orderId: number, pick: { carrier?: string; serviceCode?: string } = {}): Promise<{ shipment: ShipmentRecord; emailed: boolean }> {
  const order = await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  if (!order) throw new ShipmentError('Order not found.')
  if (!PAID_STATUSES.includes(order.status as never) || order.status === 'refunded') throw new ShipmentError('Labels can only be bought for paid orders that are not cancelled or refunded.')
  const chosen = chosenService(order)
  const carrierId = (pick.carrier || chosen?.carrier || '') as CarrierId
  const serviceCode = pick.serviceCode || chosen?.serviceCode || ''
  if (!carrierId || !carrierDef(carrierId) && carrierId !== ('mock' as CarrierId)) throw new ShipmentError('Choose a carrier first.')
  if (!serviceCode) throw new ShipmentError('Choose a service for this label.')
  const cfg = normaliseShippingConfig(await engine.findGlobal({ slug: 'shipping-settings', depth: 0, overrideAccess: true }))
  const carrier = cfg.carriers.find((c) => c.id === carrierId)
  if (!carrier || !carrier.enabled) throw new ShipmentError('That carrier is not switched on in Shop settings > Shipping.')
  if (!cfg.origin.line1 || !cfg.origin.postcode) throw new ShipmentError('Fill in the ship-from address in Shop settings > Shipping first.')
  const a = (order.shippingAddress ?? {}) as Record<string, string>
  const lines = (Array.isArray(order.lineItems) ? order.lineItems : []) as { productId?: string | number; quantity?: number; name?: string }[]
  const items: { quantity: number; weightKg: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null }[] = []
  for (const l of lines) {
    const p = l.productId ? await engine.findByID({ collection: 'products', id: l.productId, depth: 0, overrideAccess: true }).catch((): Doc | null => null) : null
    if (p && (p.isVirtual === true || p.virtual === true)) continue
    const n = (v: unknown): number | null => (typeof v === 'number' ? v : null)
    items.push({ quantity: l.quantity ?? 1, weightKg: n(p?.weight), lengthCm: n(p?.length), widthCm: n(p?.width), heightCm: n(p?.height) })
  }
  const parcels = packItems(items, cfg.presets)
  if (parcels.length === 0) throw new ShipmentError('This order has nothing to ship.')
  const adapter = getAdapter(carrierId)
  let label
  try {
    label = await adapter.createLabel(carrier.creds, {
      origin: cfg.origin,
      destination: { name: [a.firstName, a.lastName].filter(Boolean).join(' '), company: a.company, line1: a.addressLine1, line2: a.addressLine2, city: a.city, state: a.state, postcode: a.postalCode, country: a.country, phone: a.phone, email: String(order.customerEmail ?? '') },
      parcels,
      reference: String(order.orderNumber || order.id),
      serviceCode,
    })
  } catch (error) {
    throw new ShipmentError(error instanceof Error ? error.message : 'The carrier refused the label.')
  }
  const shipment: ShipmentRecord & { serviceCode?: string; carrierRef?: string; trackingUrl?: string } = {
    id: `s${Date.now().toString(36)}`,
    carrier: carrierId,
    service: label.serviceName,
    serviceCode: label.serviceCode,
    trackingNumber: label.trackingNumber,
    labelUrl: label.labelUrl,
    trackingUrl: label.trackingUrl,
    carrierRef: label.carrierRef,
    weightKg: Math.round(parcels.reduce((s, p) => s + p.weightKg, 0) * 1000) / 1000,
    createdAt: new Date().toISOString(),
    manifestId: null,
  }
  // Re-read right before writing so a parallel label purchase is not overwritten, and never list the same tracking number twice.
  const fresh = (await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })) ?? order
  const existing = (Array.isArray(fresh.shipments) ? fresh.shipments : []) as ShipmentRecord[]
  const duplicate = existing.some((s) => s.trackingNumber && s.trackingNumber === label.trackingNumber)
  const firstTracking = !fresh.trackingNumber
  const patch: Doc = { shipments: duplicate ? existing : [...existing, shipment] }
  if (firstTracking) {
    patch.trackingNumber = label.trackingNumber
    patch.trackingCarrier = carrierDef(carrierId)?.label ?? carrierId
    patch.trackingUrl = label.trackingUrl ?? ''
    patch.shippedAt = new Date().toISOString()
  }
  const updated = await engine.update({ collection: 'orders', id: orderId, data: patch, overrideAccess: true })
  const emailed = firstTracking ? await sendOrderEmail(engine as never, { ...order, ...updated, ...patch }, 'shipped') : false
  return { shipment, emailed }
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0')

/** Builds a manifest of every labelled, not-yet-manifested parcel among the given orders, stores it and marks the parcels. */
export async function createManifest(engine: ShipEngine, orderIds: number[], opts: { carrier?: string; now?: Date } = {}): Promise<{ manifest: Manifest; id: number | string }> {
  const now = opts.now ?? new Date()
  const orders: Doc[] = []
  for (const id of orderIds.slice(0, 200)) {
    const o = await engine.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
    if (o) orders.push(o)
  }
  const day = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}`
  const todays = await engine.find({ collection: 'shipping-manifests', where: { number: { like: `M-${day}-` } }, limit: 500, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] as Doc[] }))
  const number = `M-${day}-${pad(todays.docs.length + 1, 4)}`
  const manifest = buildManifest(orders as unknown as ManifestOrder[], { number, date: now.toISOString().slice(0, 10), carrier: opts.carrier, onlyUnmanifested: true })
  if (manifest.rows.length === 0) throw new ShipmentError('None of the selected orders has a labelled parcel waiting for a manifest.')
  const doc = await engine.create({
    collection: 'shipping-manifests',
    data: { number, carrier: opts.carrier ?? '', orderIds: [...new Set(manifest.rows.map((r) => r.orderId))].map(Number), orderCount: manifest.totals.orders, parcelCount: manifest.totals.parcels, weightKg: manifest.totals.weightKg, status: 'open' },
    overrideAccess: true,
  })
  const mid = idOf(doc) as number | string
  const taken = new Set(manifest.rows.map((r) => `${r.orderId}:${r.trackingNumber}`))
  for (const o of orders) {
    const list = (Array.isArray(o.shipments) ? o.shipments : []) as ShipmentRecord[]
    let changed = false
    const next = list.map((s) => {
      if (s.trackingNumber && taken.has(`${o.id}:${s.trackingNumber}`) && (s.manifestId == null || s.manifestId === '')) {
        changed = true
        return { ...s, manifestId: mid }
      }
      return s
    })
    if (changed) await engine.update({ collection: 'orders', id: o.id, data: { shipments: next }, overrideAccess: true })
  }
  return { manifest, id: mid }
}

/** Rebuilds a stored manifest for printing (all of its parcels, whatever their manifest state is now). */
export async function loadManifest(engine: ShipEngine, id: number): Promise<Manifest | null> {
  const doc = await engine.findByID({ collection: 'shipping-manifests', id, depth: 0, overrideAccess: true })
  if (!doc) return null
  const ids = (Array.isArray(doc.orderIds) ? doc.orderIds : []).map(Number).filter((n) => Number.isInteger(n))
  const orders: Doc[] = []
  for (const oid of ids) {
    const o = await engine.findByID({ collection: 'orders', id: oid, depth: 0, overrideAccess: true })
    if (!o) continue
    const list = (Array.isArray(o.shipments) ? o.shipments : []) as ShipmentRecord[]
    orders.push({ ...o, shipments: list.filter((s) => String(s.manifestId) === String(doc.id)) })
  }
  return buildManifest(orders as unknown as ManifestOrder[], { number: String(doc.number), date: String(doc.createdAt ?? '').slice(0, 10), carrier: (doc.carrier as string) || undefined, onlyUnmanifested: false })
}
