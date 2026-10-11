import { toCents } from './money'

export type ShippingAddress = { country?: string | null; state?: string | null; postalCode?: string | null }

export type ShippingRegion = {
  type: 'country' | 'state' | 'postcode'
  /** ISO country. Required for every type. */
  country?: string | null
  /** state: a code (NSW). postcode: comma list of exact codes, ranges (2000-2999) and wildcards (20*). */
  value?: string | null
}

export type TableRate = { min?: number | null; max?: number | null; cost?: number | null }
export type ClassSurcharge = { shippingClass?: string | null; cost?: number | null }

export type ShippingMethod = {
  id?: string | number | null
  type: 'flat' | 'free_over_amount' | 'local_pickup' | 'table_rate'
  title: string
  /** Whole dollars, as entered in the admin. */
  cost?: number | null
  taxable?: boolean | null
  /** Whole dollars. For `free_over_amount`: cart subtotal at or above which shipping is free. */
  freeOver?: number | null
  tableBasis?: 'weight' | 'subtotal' | 'item_count' | null
  tableRates?: TableRate[] | null
  classSurcharges?: ClassSurcharge[] | null
  enabled?: boolean | null
}

export type ShippingZone = {
  id: string | number
  name: string
  order?: number | null
  regions?: ShippingRegion[] | null
  methods?: ShippingMethod[] | null
}

export type ShippingCartItem = {
  productId: number | string
  quantity: number
  /** grams */
  weightGrams?: number | null
  shippingClass?: string | number | null
  requiresShipping?: boolean
}

export type ShippingCart = {
  /** Cents, AFTER discounts. */
  subtotalCents: number
  items: ShippingCartItem[]
  freeShipping?: boolean
}

export type ShippingOption = {
  /** `${zoneId}:${methodIndex}` - what the client sends back and the server re-validates. */
  id: string
  zoneId: string | number
  zoneName: string
  type: ShippingMethod['type']
  title: string
  costCents: number
  taxable: boolean
}

const norm = (v: string | null | undefined): string => (v ?? '').trim().toUpperCase()

export function postcodeMatches(rule: string, postcode: string): boolean {
  const pc = norm(postcode).replace(/\s+/g, '')
  if (!pc) return false
  for (const raw of rule.split(',')) {
    const part = norm(raw).replace(/\s+/g, '')
    if (!part) continue
    if (part.includes('-') && !part.includes('*')) {
      const [lo, hi] = part.split('-')
      if (/^\d+$/.test(lo) && /^\d+$/.test(hi) && /^\d+$/.test(pc)) {
        const n = Number(pc)
        if (n >= Number(lo) && n <= Number(hi)) return true
        continue
      }
      if (pc >= lo && pc <= hi && pc.length === lo.length) return true
      continue
    }
    if (part.includes('*')) {
      const re = new RegExp(`^${part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
      if (re.test(pc)) return true
      continue
    }
    if (part === pc) return true
  }
  return false
}

export function regionMatches(region: ShippingRegion, address: ShippingAddress): boolean {
  if (norm(region.country) && norm(region.country) !== norm(address.country)) return false
  switch (region.type) {
    case 'country':
      return Boolean(norm(region.country))
    case 'state':
      return norm(region.value) !== '' && norm(region.value) === norm(address.state)
    case 'postcode':
      return postcodeMatches(region.value ?? '', address.postalCode ?? '')
    default:
      return false
  }
}

/**
 * The first zone (by `order`, then listing order) whose regions match the
 * address. A zone with no regions is a catch-all "rest of world" zone.
 */
export function matchZone(zones: ShippingZone[], address: ShippingAddress): ShippingZone | null {
  const sorted = zones
    .map((z, i) => ({ z, i }))
    .sort((a, b) => (a.z.order ?? 0) - (b.z.order ?? 0) || a.i - b.i)
    .map((x) => x.z)
  for (const zone of sorted) {
    const regions = zone.regions ?? []
    if (regions.length === 0) return zone
    if (regions.some((r) => regionMatches(r, address))) return zone
  }
  return null
}

function classSurchargeCents(method: ShippingMethod, items: ShippingCartItem[]): number {
  const rows = method.classSurcharges ?? []
  if (rows.length === 0) return 0
  let total = 0
  for (const row of rows) {
    const cls = row.shippingClass == null ? '' : String(row.shippingClass)
    if (!cls) continue
    const qty = items.filter((i) => i.shippingClass != null && String(i.shippingClass) === cls).reduce((s, i) => s + i.quantity, 0)
    // The surcharge is charged once per shipped item of that class.
    total += qty * toCents(row.cost ?? 0)
  }
  return total
}

function tableCostCents(method: ShippingMethod, cart: ShippingCart): number | null {
  const rows = method.tableRates ?? []
  const basis = method.tableBasis ?? 'weight'
  const value =
    basis === 'subtotal'
      ? cart.subtotalCents / 100
      : basis === 'item_count'
        ? cart.items.reduce((s, i) => s + i.quantity, 0)
        : cart.items.reduce((s, i) => s + (i.weightGrams ?? 0) * i.quantity, 0) / 1000 // kg
  for (const row of rows) {
    const min = row.min ?? 0
    const max = row.max == null || row.max === 0 ? Number.POSITIVE_INFINITY : row.max
    if (value >= min && value <= max) return toCents(row.cost ?? 0)
  }
  return null
}

/**
 * Shipping options for a cart at an address. Pure: callers load zones from the
 * database. Returns `[]` when no zone matches or nothing in the cart ships.
 * The `id` of an option is `${zoneId}:${methodIndex}`; checkout sends only that
 * id back and the server recomputes the cost with this same function.
 */
export function quoteShipping(cart: ShippingCart, address: ShippingAddress, zones: ShippingZone[]): ShippingOption[] {
  const shipped = cart.items.filter((i) => i.requiresShipping !== false)
  if (shipped.length === 0) return []
  const zone = matchZone(zones, address)
  if (!zone) return []
  const options: ShippingOption[] = []
  ;(zone.methods ?? []).forEach((method, index) => {
    if (method.enabled === false) return
    let cost: number | null = null
    switch (method.type) {
      case 'local_pickup':
        cost = toCents(method.cost ?? 0)
        break
      case 'flat':
        cost = toCents(method.cost ?? 0) + classSurchargeCents(method, shipped)
        break
      case 'free_over_amount': {
        const threshold = toCents(method.freeOver ?? 0)
        // Offered only once the (post-discount) subtotal reaches the threshold.
        cost = threshold > 0 && cart.subtotalCents >= threshold ? 0 : null
        break
      }
      case 'table_rate': {
        const base = tableCostCents(method, { ...cart, items: shipped })
        cost = base == null ? null : base + classSurchargeCents(method, shipped)
        break
      }
    }
    if (cost == null) return
    if (cart.freeShipping && method.type !== 'local_pickup') cost = 0
    options.push({
      id: `${zone.id}:${index}`,
      zoneId: zone.id,
      zoneName: zone.name,
      type: method.type,
      title: method.title,
      costCents: cost,
      taxable: method.type === 'local_pickup' ? false : method.taxable !== false,
    })
  })
  return options
}
