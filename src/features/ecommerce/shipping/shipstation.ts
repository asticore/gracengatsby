import { basicAuth, fetchJson } from './http'
import { buildLabelBody, buildRatesBody, joinServiceCode, parseCarriers, parseLabel, parseRates, refusalMessage, sydneyShipDate, splitServiceCode, SHIPSTATION_BASE, type ConnectedCarrier } from './shipstation-labels'
import type { CarrierAdapter, CarrierCredentials, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

/** Keeps a checkout under ShipStation's 40 requests a minute, even for a shop with many carriers. */
const MAX_CARRIERS_PRICED = 5

const headers = (creds: CarrierCredentials): Record<string, string> => ({
  Authorization: basicAuth(creds.values.apiKey ?? '', creds.values.apiSecret ?? ''),
  Accept: 'application/json',
})

const hasKeys = (creds: CarrierCredentials): boolean => Boolean(creds.values.apiKey?.trim() && creds.values.apiSecret?.trim())

/**
 * ShipStation as a shipping hub: one account, many carriers. Rates and labels are asked of each carrier
 * the account has connected in ShipStation (GET /carriers), so a service id is "carrierCode/serviceCode".
 * ShipStation has no sandbox, so test mode prices parcels but refuses to buy a label.
 */
export class ShipStationAdapter implements CarrierAdapter {
  readonly id = 'shipstation' as const

  private async connectedCarriers(creds: CarrierCredentials): Promise<ConnectedCarrier[]> {
    const res = await fetchJson<unknown>(`${SHIPSTATION_BASE}/carriers`, { headers: headers(creds) })
    if (res.status === 401 || res.status === 403) throw new Error('ShipStation did not accept the API key or API secret.')
    if (res.status === 429) throw new Error('ShipStation is busy right now (too many requests). Wait a minute and try again.')
    if (!res.ok || !Array.isArray(res.body)) throw new Error(`ShipStation answered ${res.status}.`)
    return parseCarriers(res.body)
  }

  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    if (!hasKeys(creds)) return { ok: false, message: 'Enter the ShipStation API key and API secret first.' }
    try {
      const list = await this.connectedCarriers(creds)
      if (list.length === 0) return { ok: false, message: 'Connected to ShipStation, but no carriers are connected there yet. Add a carrier under Settings > Carriers in ShipStation first.' }
      const names = list.map((c) => c.name).join(', ')
      const tail = creds.testMode ? ' Test mode is on, so labels will not be bought.' : ''
      return { ok: true, message: `Connected to ShipStation. Carriers: ${names}.${tail}` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach ShipStation.' }
    }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    if (!request.origin.postcode || !request.destination.postcode) throw new Error('ShipStation needs a postcode on both addresses.')
    const carriers = (await this.connectedCarriers(creds)).slice(0, MAX_CARRIERS_PRICED)
    if (carriers.length === 0) throw new Error('No carriers are connected in ShipStation yet.')
    const quotes: RateQuote[] = []
    let failed = 0
    for (const carrier of carriers) {
      const res = await fetchJson<unknown>(`${SHIPSTATION_BASE}/shipments/getrates`, {
        method: 'POST',
        headers: { ...headers(creds), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRatesBody(carrier.code, request.origin, request.destination, request.parcels)),
      })
      if (res.status === 429) break
      if (!res.ok) {
        failed += 1
        continue
      }
      for (const r of parseRates(res.body)) {
        quotes.push({ carrier: 'shipstation', serviceCode: joinServiceCode(carrier.code, r.serviceCode), serviceName: `${carrier.name} ${r.serviceName}`, costCents: r.costCents, etaDays: null })
      }
    }
    if (quotes.length === 0) throw new Error(failed > 0 ? 'ShipStation could not price this parcel with its carriers.' : 'ShipStation is busy right now (too many requests). Wait a minute and try again.')
    return quotes
  }

  /** Buys one label. Test mode and missing keys are refused before any network call. */
  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    if (!hasKeys(creds)) throw new Error('Enter the ShipStation API key and API secret first.')
    if (creds.testMode) throw new Error('Test mode is on for ShipStation, so no real label was bought. Switch test mode off in Shop settings > Shipping to buy labels.')
    if (request.parcels.length !== 1) throw new Error('ShipStation labels are bought one parcel at a time from here. Buy the other parcels in ShipStation.')
    const { carrierCode, serviceCode } = splitServiceCode(request.serviceCode)
    const body = buildLabelBody(request, carrierCode, serviceCode, sydneyShipDate(new Date()))
    const res = await fetchJson<unknown>(
      `${SHIPSTATION_BASE}/shipments/createlabel`,
      { method: 'POST', headers: { ...headers(creds), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      20000,
    )
    if (!res.ok) throw refusalMessage(res.status, res.body, 'refused the label')
    const label = parseLabel(res.body)
    return {
      carrier: 'shipstation',
      serviceCode: request.serviceCode,
      serviceName: `ShipStation ${request.serviceCode}`,
      trackingNumber: label.trackingNumber,
      labelUrl: `data:application/pdf;base64,${label.labelData}`,
      carrierRef: label.shipmentId || undefined,
      ...(label.costCents !== undefined ? { costCents: label.costCents } : {}),
    }
  }
}
