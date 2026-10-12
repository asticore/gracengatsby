import type { CarrierAdapter, CarrierCredentials, CarrierManifestResult, ConnectionResult, LabelRequest, LabelResult, ManifestShipment, RateQuote, RateRequest } from './types'

/**
 * Deterministic in-memory carrier for tests and local trials. Rates depend only on weight; labels
 * get a predictable tracking number; the end-of-day manifest always succeeds.
 */
export class MockCarrierAdapter implements CarrierAdapter {
  readonly id = 'mock' as const
  readonly calls: { method: string; args: unknown[] }[] = []
  /** Set to make the next getRates/createLabel throw, to exercise the fall-back paths. */
  failWith: string | null = null

  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    this.calls.push({ method: 'testConnection', args: [creds] })
    if (this.failWith) return { ok: false, message: this.failWith }
    return { ok: true, message: 'Mock carrier connected.' }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    this.calls.push({ method: 'getRates', args: [creds, request] })
    if (this.failWith) throw new Error(this.failWith)
    const kg = request.parcels.reduce((s, p) => s + p.weightKg, 0)
    const base = 800 + Math.round(kg * 300) + (request.parcels.length - 1) * 400
    return [
      { carrier: 'mock', serviceCode: 'STD', serviceName: 'Standard', costCents: base, etaDays: 5 },
      { carrier: 'mock', serviceCode: 'EXP', serviceName: 'Express', costCents: Math.round(base * 1.6), etaDays: 2 },
    ]
  }

  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    this.calls.push({ method: 'createLabel', args: [creds, request] })
    if (this.failWith) throw new Error(this.failWith)
    const tracking = `MOCK${String(request.reference).replace(/\D/g, '').padStart(6, '0')}${request.serviceCode}`
    return {
      carrier: 'mock',
      serviceCode: request.serviceCode,
      serviceName: request.serviceCode === 'EXP' ? 'Express' : 'Standard',
      trackingNumber: tracking,
      labelUrl: `https://labels.example.test/${tracking}.pdf`,
      trackingUrl: `https://track.example.test/${tracking}`,
      carrierRef: `ref-${tracking}`,
      costCents: 800,
    }
  }

  async endOfDayManifest(_creds: CarrierCredentials, shipments: ManifestShipment[]): Promise<CarrierManifestResult> {
    this.calls.push({ method: 'endOfDayManifest', args: [shipments] })
    if (this.failWith) return { ok: false, message: this.failWith }
    return { ok: true, message: `Manifest lodged for ${shipments.length} parcel(s).`, reference: `MANIFEST-${shipments.length}` }
  }
}
