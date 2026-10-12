/**
 * Carrier integration contract. Every carrier sits behind `CarrierAdapter`, so checkout, "Buy label"
 * and manifests never know which carrier they are talking to, and tests use the mock adapter.
 *
 * Units are canonical metric: kilograms and centimetres. Money is whole cents.
 */

export type CarrierId = 'auspost' | 'sendle' | 'startrack' | 'couriersplease' | 'dhl' | 'ups' | 'fedex' | 'shipstation' | 'shippit' | 'mock'

export type CarrierCredentials = {
  /** Values by field key, already decrypted. */
  values: Record<string, string>
  /** True = use the carrier's sandbox / test environment. */
  testMode: boolean
}

export type Address = {
  name?: string
  company?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  phone?: string
  email?: string
}

export type Parcel = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number }

export type RateRequest = { origin: Address; destination: Address; parcels: Parcel[]; declaredValueCents?: number }

export type RateQuote = {
  carrier: CarrierId
  serviceCode: string
  serviceName: string
  costCents: number
  /** Estimated days in transit, when the carrier says. */
  etaDays?: number | null
}

export type LabelRequest = RateRequest & {
  /** Order id and number, used as the carrier's reference. */
  reference: string
  serviceCode: string
  description?: string
}

export type LabelResult = {
  carrier: CarrierId
  serviceCode: string
  serviceName: string
  trackingNumber: string
  /** Where the label PDF can be fetched. */
  labelUrl: string
  trackingUrl?: string
  /** The carrier's own shipment/order id, needed for a later end-of-day manifest. */
  carrierRef?: string
  costCents?: number
}

export type ConnectionResult = { ok: boolean; message: string }

export type ManifestShipment = { trackingNumber: string; carrierRef?: string; reference: string }

export type CarrierManifestResult = { ok: boolean; message: string; reference?: string; url?: string }

export interface CarrierAdapter {
  readonly id: CarrierId
  /** Checks the keys by making the cheapest real call the carrier offers. Never throws. */
  testConnection(creds: CarrierCredentials): Promise<ConnectionResult>
  /** Live rates. Throws on failure so the caller can fall back to zone rates. */
  getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]>
  /** Buys a label. Throws with a plain-English message on failure. */
  createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult>
  /** Optional end-of-day / dispatch manifest with the carrier (Australia Post and Sendle style). */
  endOfDayManifest?(creds: CarrierCredentials, shipments: ManifestShipment[]): Promise<CarrierManifestResult>
}

export type CarrierField = {
  key: string
  label: string
  secret?: boolean
  help: string
  placeholder?: string
}

export type CarrierDef = {
  id: Exclude<CarrierId, 'mock'>
  label: string
  summary: string
  signupUrl: string
  docsUrl: string
  /** Where in the carrier's dashboard the keys are found. */
  keysHelp: string
  fields: CarrierField[]
  /** What the built-in adapter really does. `false` means: settings and test only, use zone rates and record tracking by hand. */
  live: { rates: boolean; labels: boolean }
}
