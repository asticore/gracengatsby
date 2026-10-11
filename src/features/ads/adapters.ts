/**
 * The header-bidding adapters an editor can switch on, with the parameters
 * each one needs and how it appears in ads.txt.
 *
 * `scope` says where a parameter normally lives: `account` values are the same
 * on every slot (one account id), `unit` values differ per ad unit (a zone or
 * placement id). Both are stored as defaults on the Ads settings and a unit may
 * override any of them in its own bidder-params JSON.
 *
 * Amazon TAM is not a Prebid adapter: it is the apstag.js library that runs
 * beside Prebid and hands its bids to Google Ad Manager. It is listed here
 * because an editor thinks of it as "another bidder".
 *
 * The ads.txt cert ids (the last field) are each network's published TAG ID.
 * Check them against the network's own documentation before relying on them -
 * a wrong id is not harmful but the line will not authorise anything.
 */

import { PARAM_ID_PATTERN } from './validate'

export type AdapterParamDef = {
  name: string
  label: string
  type: 'string' | 'number'
  required: boolean
  scope: 'account' | 'unit'
  help?: string
}

export type AdapterDef = {
  code: string
  label: string
  /** Prebid adapter, or Amazon's own library. */
  kind: 'prebid' | 'apstag'
  params: AdapterParamDef[]
  /** Which parameter carries the account that ads.txt should name, when it is also a bid param. */
  adsTxt: { domain: string; certId: string | null }
  help: string
}

export const ADAPTERS: AdapterDef[] = [
  {
    code: 'appnexus',
    label: 'Xandr / AppNexus',
    kind: 'prebid',
    params: [{ name: 'placementId', label: 'Placement id', type: 'number', required: true, scope: 'unit', help: 'Numeric placement id from Xandr Monetize.' }],
    adsTxt: { domain: 'appnexus.com', certId: 'f5ab79cb980f11d1' },
    help: 'Xandr (Microsoft Monetize).',
  },
  {
    code: 'rubicon',
    label: 'Magnite / Rubicon',
    kind: 'prebid',
    params: [
      { name: 'accountId', label: 'Account id', type: 'number', required: true, scope: 'account' },
      { name: 'siteId', label: 'Site id', type: 'number', required: true, scope: 'account' },
      { name: 'zoneId', label: 'Zone id', type: 'number', required: true, scope: 'unit', help: 'Usually different for each ad unit.' },
    ],
    adsTxt: { domain: 'rubiconproject.com', certId: '0bfd66d529a55807' },
    help: 'Magnite Demand Manager (Rubicon Project).',
  },
  {
    code: 'pubmatic',
    label: 'PubMatic',
    kind: 'prebid',
    params: [
      { name: 'publisherId', label: 'Publisher id', type: 'string', required: true, scope: 'account' },
      { name: 'adSlot', label: 'Ad slot', type: 'string', required: true, scope: 'unit', help: 'Format: slotName@WIDTHxHEIGHT or the slot id from PubMatic.' },
    ],
    adsTxt: { domain: 'pubmatic.com', certId: '5d62403b186f2ace' },
    help: 'PubMatic OpenWrap / PubMatic SSP.',
  },
  {
    code: 'openx',
    label: 'OpenX',
    kind: 'prebid',
    params: [
      { name: 'delDomain', label: 'Delivery domain', type: 'string', required: true, scope: 'account', help: 'For example yourname-d.openx.net' },
      { name: 'unit', label: 'Ad unit id', type: 'string', required: true, scope: 'unit' },
    ],
    adsTxt: { domain: 'openx.com', certId: '6a698e2ec38604c6' },
    help: 'OpenX Ad Exchange.',
  },
  {
    code: 'ix',
    label: 'Index Exchange',
    kind: 'prebid',
    params: [
      { name: 'siteId', label: 'Site id', type: 'string', required: true, scope: 'unit', help: 'Index Exchange site id for this slot.' },
    ],
    adsTxt: { domain: 'indexexchange.com', certId: '50b1c356f2c5c8fc' },
    help: 'Index Exchange.',
  },
  {
    code: 'amazon',
    label: 'Amazon TAM',
    kind: 'apstag',
    params: [{ name: 'pubID', label: 'Publisher id', type: 'string', required: true, scope: 'account', help: 'Your Amazon Publisher Services id.' }],
    adsTxt: { domain: 'aps.amazon.com', certId: null },
    help: 'Amazon Transparent Ad Marketplace, loaded as apstag.js and bid into Google Ad Manager.',
  },
]

export const ADAPTER_CODES: readonly string[] = ADAPTERS.map((a) => a.code)
export const getAdapter = (code: string): AdapterDef | undefined => ADAPTERS.find((a) => a.code === code)

export type BidderParams = Record<string, string | number>

/**
 * Keeps only known params of the right type that match the safe pattern.
 * Never throws: bad values are dropped, so output is always safe to JSON-encode.
 */
export function sanitiseParams(code: string, raw: unknown): BidderParams {
  const adapter = getAdapter(code)
  const out: BidderParams = {}
  if (!adapter || !raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const source = raw as Record<string, unknown>
  for (const def of adapter.params) {
    const value = source[def.name]
    if (def.type === 'number') {
      const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,12}$/.test(value.trim()) ? Number(value) : NaN
      if (Number.isInteger(n) && n >= 0 && n <= 999_999_999_999) out[def.name] = n
    } else if (typeof value === 'string') {
      const v = value.trim()
      if (def.name === 'adSlot' ? /^[A-Za-z0-9_.:@-]{1,64}$/.test(v) : def.name === 'delDomain' ? /^[a-z0-9.-]{3,100}$/i.test(v) : PARAM_ID_PATTERN.test(v)) out[def.name] = v
    }
  }
  return out
}

/** Problems with a params object, for forms. Unknown keys and bad values are reported. */
export function validateParams(code: string, raw: unknown, options: { requireAll?: boolean } = {}): string[] {
  const adapter = getAdapter(code)
  if (!adapter) return [`Unknown bidder "${String(code).slice(0, 20)}".`]
  if (raw === null || raw === undefined || raw === '') return options.requireAll ? adapter.params.filter((p) => p.required).map((p) => `${adapter.label}: ${p.label} is required.`) : []
  if (typeof raw !== 'object' || Array.isArray(raw)) return [`${adapter.label}: parameters must be an object.`]
  const source = raw as Record<string, unknown>
  const errors: string[] = []
  const known = new Set(adapter.params.map((p) => p.name))
  for (const key of Object.keys(source)) if (!known.has(key)) errors.push(`${adapter.label}: unknown parameter "${key.slice(0, 20)}".`)
  const clean = sanitiseParams(code, source)
  for (const def of adapter.params) {
    const present = source[def.name] !== undefined && source[def.name] !== null && source[def.name] !== ''
    if (present && clean[def.name] === undefined) errors.push(`${adapter.label}: ${def.label} is not valid.`)
    if (!present && def.required && options.requireAll) errors.push(`${adapter.label}: ${def.label} is required.`)
  }
  return errors
}

/** The ads.txt line for an adapter and its seller (account) id, or null when the id is unusable. */
export function adsTxtLineFor(code: string, sellerId: unknown): string | null {
  const adapter = getAdapter(code)
  if (!adapter || typeof sellerId !== 'string' && typeof sellerId !== 'number') return null
  const id = String(sellerId).trim()
  if (!PARAM_ID_PATTERN.test(id)) return null
  return `${adapter.adsTxt.domain}, ${id}, DIRECT${adapter.adsTxt.certId ? `, ${adapter.adsTxt.certId}` : ''}`
}
