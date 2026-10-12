// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { bnplAvailability, bnplMessage, instalments, messagesFromPublicConfig, normaliseBnpl, publicPaymentConfig, stripeMethodTypes } from '@/features/ecommerce/lib/paymentMethods'
import { buildFeedItems, googleMerchantXml, metaCatalogCsv, plainText } from '@/features/ecommerce/lib/feeds'
import { renderInvoiceHtml, renderPackingSlipHtml } from '@/features/ecommerce/lib/invoice'
import { documentTitle, formatInvoiceNumber, normaliseInvoiceSettings, safeLogoUrl } from '@/features/ecommerce/lib/invoiceSettings'
import { buildManifest, code39Patterns, code39Svg, code39Text, csvCell, manifestCsv, renderManifestHtml, unmanifested } from '@/features/ecommerce/lib/manifest'
import {
  cleanRecipient,
  expiryFor,
  generateGiftCardCode,
  giftAmountError,
  giftCardUnusable,
  maskGiftCardCode,
  normaliseGiftCardCode,
  normaliseGiftCardSettings,
  parsePresetAmounts,
  planStoredValue,
} from '@/features/ecommerce/lib/storedValue'
import { cmToDisplay, displayToCm, displayToKg, formatDimensions, formatWeight, kgToDisplay, normaliseUnitSystem, unitHelp } from '@/features/ecommerce/lib/units'
import { renderOrderEmail, templateFor } from '@/features/ecommerce/server/emails'
import { CARRIERS, carrierDef, missingCredentialKeys } from '@/features/ecommerce/shipping/catalogue'
import { http } from '@/features/ecommerce/shipping/http'
import { MockCarrierAdapter } from '@/features/ecommerce/shipping/mock'
import { cubicWeightKg, normalisePresets, packItems } from '@/features/ecommerce/shipping/packing'
import { AusPostAdapter } from '@/features/ecommerce/shipping/auspost'
import { SendleAdapter } from '@/features/ecommerce/shipping/sendle'
import { fetchLiveRates, getAdapter, liveOptionId, mergeShippingOptions, normaliseShippingConfig, parseLiveOptionId, withHandling } from '@/features/ecommerce/shipping/registry'

describe('units', () => {
  it('stores metric and converts for display', () => {
    expect(kgToDisplay(1, 'imperial')).toBeCloseTo(2.205, 3)
    expect(displayToKg(2.205, 'imperial')).toBeCloseTo(1, 2)
    expect(cmToDisplay(2.54, 'imperial')).toBe(1)
    expect(displayToCm(10, 'imperial')).toBe(25.4)
    expect(kgToDisplay(1.5, 'metric')).toBe(1.5)
  })
  it('formats with the right label', () => {
    expect(formatWeight(2, 'metric')).toBe('2 kg')
    expect(formatWeight(1, 'imperial')).toBe('2.205 lb')
    expect(formatWeight(null, 'metric')).toBe('')
    expect(formatDimensions({ length: 30, width: 20, height: 10 }, 'metric')).toBe('30 x 20 x 10 cm')
    expect(formatDimensions({ length: 25.4, width: 25.4, height: 2.54 }, 'imperial')).toBe('10 x 10 x 1 in')
    expect(formatDimensions({ length: 1 }, 'metric')).toBe('')
  })
  it('defaults unknown input to metric and explains the unit', () => {
    expect(normaliseUnitSystem('banana')).toBe('metric')
    expect(normaliseUnitSystem('imperial')).toBe('imperial')
    expect(unitHelp('weight', 'imperial')).toMatch(/kilograms/)
    expect(unitHelp('dimension', 'metric')).toMatch(/Centimetres/)
  })
})

describe('gift cards and store credit', () => {
  it('makes readable codes and round-trips them', () => {
    const code = generateGiftCardCode()
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/)
    expect(normaliseGiftCardCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code)
    expect(normaliseGiftCardCode('too short')).toBe('')
    expect(normaliseGiftCardCode('0000-0000-0000-0000')).toBe('') // 0 is not in the alphabet
    expect(normaliseGiftCardCode(42)).toBe('')
    expect(maskGiftCardCode('ABCD-EFGH-JKMN-PQRS')).toBe('XXXX-XXXX-XXXX-PQRS')
  })
  it('validates amounts against the settings', () => {
    const s = normaliseGiftCardSettings({ minAmount: 20, maxAmount: 200, presetAmounts: '25, 50', allowCustomAmount: true })
    expect(s.presetAmounts).toEqual([25, 50])
    expect(giftAmountError(2500, s)).toBeNull()
    expect(giftAmountError(3000, s)).toBeNull()
    expect(giftAmountError(1000, s)).toMatch(/smallest/)
    expect(giftAmountError(30000, s)).toMatch(/largest/)
    expect(giftAmountError(12.5, s)).toMatch(/Choose/)
    expect(giftAmountError(3000, { ...s, allowCustomAmount: false })).toMatch(/listed/)
    expect(giftAmountError(5000, { ...s, allowCustomAmount: false })).toBeNull()
    expect(parsePresetAmounts('50, 25, abc, -3, 25')).toEqual([25, 50])
  })
  it('checks recipients and the send date', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    expect(cleanRecipient({ email: 'nope' }, now)).toEqual({ ok: false, error: expect.stringMatching(/recipient email/) })
    const ok = cleanRecipient({ email: ' Friend@Example.com ', name: 'F', message: 'x'.repeat(900), sendAt: '2026-12-25T00:00:00Z' }, now)
    expect(ok.ok && ok.value.email).toBe('friend@example.com')
    expect(ok.ok && ok.value.message.length).toBe(500)
    expect(ok.ok && ok.value.sendAt).toBe('2026-12-25T00:00:00.000Z')
    const past = cleanRecipient({ email: 'a@b.co', sendAt: '2026-01-01' }, now)
    expect(past.ok && past.value.sendAt).toBeNull() // already due: send now
    expect(cleanRecipient({ email: 'a@b.co', sendAt: '2030-01-01' }, now)).toEqual({ ok: false, error: expect.stringMatching(/within a year/) })
    expect(cleanRecipient({ email: 'a@b.co', sendAt: 'soon' }, now)).toEqual({ ok: false, error: expect.stringMatching(/not valid/) })
  })
  it('says why a card cannot be used', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    const card = { id: 1, code: 'X', balance: 500, currency: 'AUD', status: 'active', expiresAt: null as string | null }
    expect(giftCardUnusable(card, 'AUD', now)).toBeNull()
    expect(giftCardUnusable(null, 'AUD', now)).toMatch(/not found/)
    expect(giftCardUnusable({ ...card, status: 'pending' }, 'AUD', now)).toMatch(/not been delivered/)
    expect(giftCardUnusable({ ...card, status: 'disabled' }, 'AUD', now)).toMatch(/cannot be used/)
    expect(giftCardUnusable({ ...card, balance: 0 }, 'AUD', now)).toMatch(/no balance/)
    expect(giftCardUnusable({ ...card, expiresAt: '2026-01-01T00:00:00Z' }, 'AUD', now)).toMatch(/expired/)
    expect(giftCardUnusable(card, 'USD', now)).toMatch(/currency/)
    expect(expiryFor(normaliseGiftCardSettings({ expiryMonths: 12 }), now)).toBe('2027-10-14T00:00:00.000Z')
    expect(expiryFor(normaliseGiftCardSettings({}), now)).toBeNull()
  })
  const lines = [
    { productId: '1', netCents: 6000 },
    { productId: '2', netCents: 4000 },
  ]
  it('uses gift cards first, then credit, never past the total or a balance', () => {
    const plan = planStoredValue({ totalCents: 10000, lines, giftCards: [{ id: 1, code: 'A', balance: 3000 }], creditBalanceCents: 5000, useCredit: true })
    expect(plan.giftCards).toEqual([{ id: 1, code: 'A', cents: 3000 }])
    expect(plan.creditCents).toBe(5000)
    expect(plan.payableCents).toBe(2000)
    const all = planStoredValue({ totalCents: 10000, lines, giftCards: [{ id: 1, code: 'A', balance: 99999 }], creditBalanceCents: 5000, useCredit: true })
    expect(all.giftCards[0].cents).toBe(10000)
    expect(all.creditCents).toBe(0)
    expect(all.payableCents).toBe(0)
    expect(planStoredValue({ totalCents: 10000, lines, giftCards: [], creditBalanceCents: 5000, useCredit: false }).payableCents).toBe(10000)
  })
  it('keeps the remainder on a partly used card (the plan only takes what is needed)', () => {
    const plan = planStoredValue({ totalCents: 2500, lines: [{ productId: '1', netCents: 2500 }], giftCards: [{ id: 1, code: 'A', balance: 10000 }], creditBalanceCents: 0, useCredit: false })
    expect(plan.giftCards[0].cents).toBe(2500)
  })
  it('cannot pay for a gift card with stored value', () => {
    const plan = planStoredValue({
      totalCents: 8000,
      lines: [{ productId: '9', netCents: 5000, isGiftCard: true }, { productId: '1', netCents: 3000 }],
      giftCards: [{ id: 1, code: 'A', balance: 99999 }],
      creditBalanceCents: 99999,
      useCredit: true,
    })
    expect(plan.coveredCents).toBe(3000)
    expect(plan.payableCents).toBe(5000)
  })
  it('a course voucher only covers its own product', () => {
    const plan = planStoredValue({ totalCents: 10000, lines, giftCards: [{ id: 1, code: 'V', balance: 99999, restrictProduct: 2 }], creditBalanceCents: 0, useCredit: false })
    expect(plan.giftCards[0].cents).toBe(4000)
    expect(plan.payableCents).toBe(6000)
    // two vouchers for the same product cannot cover it twice
    const two = planStoredValue({ totalCents: 10000, lines, giftCards: [{ id: 1, code: 'V', balance: 99999, restrictProduct: 2 }, { id: 2, code: 'W', balance: 99999, restrictProduct: 2 }], creditBalanceCents: 0, useCredit: false })
    expect(two.coveredCents).toBe(4000)
  })
})

describe('pay later methods', () => {
  const settings = { afterpay: { enabled: true, minOrder: 50, maxOrder: 1000 }, klarna: { enabled: true } }
  it('applies min, max, country and currency rules', () => {
    const a = normaliseBnpl('afterpay', settings.afterpay)
    expect(bnplAvailability('afterpay', a, { amountCents: 10000, country: 'au', currency: 'AUD' })).toEqual({ ok: true })
    expect(bnplAvailability('afterpay', a, { amountCents: 4999, country: 'AU', currency: 'AUD' })).toEqual({ ok: false, reason: 'below the minimum order value' })
    expect(bnplAvailability('afterpay', a, { amountCents: 100001, country: 'AU', currency: 'AUD' })).toEqual({ ok: false, reason: 'above the maximum order value' })
    expect(bnplAvailability('afterpay', a, { amountCents: 10000, country: 'FR', currency: 'AUD' }).ok).toBe(false)
    expect(bnplAvailability('afterpay', a, { amountCents: 10000, country: 'AU', currency: 'EUR' }).ok).toBe(false)
    expect(bnplAvailability('afterpay', normaliseBnpl('afterpay', { enabled: false }), { amountCents: 10000, country: 'AU', currency: 'AUD' })).toEqual({ ok: false, reason: 'turned off' })
    const custom = normaliseBnpl('afterpay', { enabled: true, countries: 'AU, NZ', currencies: ['AUD'] })
    expect(custom.countries).toEqual(['AU', 'NZ'])
    expect(bnplAvailability('afterpay', custom, { amountCents: 10000, country: 'US', currency: 'AUD' }).ok).toBe(false)
  })
  it('splits into instalments that add up', () => {
    expect(instalments(10000)).toEqual([2500, 2500, 2500, 2500])
    expect(instalments(10001).reduce((a, b) => a + b, 0)).toBe(10001)
    expect(instalments(0)).toEqual([])
  })
  it('writes the pay in 4 message only when available', () => {
    const a = normaliseBnpl('afterpay', settings.afterpay)
    expect(bnplMessage('afterpay', a, { amountCents: 10000, country: 'AU', currency: 'AUD' })).toBe('or 4 interest-free payments of $25.00 with Afterpay')
    expect(bnplMessage('afterpay', a, { amountCents: 500, country: 'AU', currency: 'AUD' })).toBeNull()
    expect(bnplMessage('afterpay', { ...a, showMessaging: false }, { amountCents: 10000, country: 'AU', currency: 'AUD' })).toBeNull()
    const k = normaliseBnpl('klarna', { enabled: true })
    expect(bnplMessage('klarna', k, { amountCents: 10000, country: 'AU', currency: 'AUD' })).toBe('or 4 payments of $25.00 with Klarna')
  })
  it('chooses Stripe method types, leaving Apple/Google Pay to the card method', () => {
    expect(stripeMethodTypes({}, { amountCents: 10000, country: 'AU', currency: 'AUD' })).toBeNull()
    expect(stripeMethodTypes(settings, { amountCents: 10000, country: 'AU', currency: 'AUD' })).toEqual(['card', 'afterpay_clearpay', 'klarna'])
    expect(stripeMethodTypes(settings, { amountCents: 1000, country: 'AU', currency: 'AUD' })).toEqual(['card', 'klarna'])
    expect(stripeMethodTypes({ afterpay: { enabled: true } }, { amountCents: 100000000, country: 'AU', currency: 'AUD' })).toEqual(['card'])
  })
  it('exposes only public values to the browser', () => {
    const cfg = publicPaymentConfig({ ...settings, afterpay: { ...settings.afterpay, secretKey: 'sk_live_x' } } as never, 'AUD')
    expect(JSON.stringify(cfg)).not.toContain('sk_live')
    expect(messagesFromPublicConfig(cfg, 10000, 'AU')).toEqual(['or 4 interest-free payments of $25.00 with Afterpay', 'or 4 payments of $25.00 with Klarna'])
    expect(cfg.wallets).toEqual({ applePay: true, googlePay: true })
  })
})

describe('carrier catalogue, packing and live rates', () => {
  it('lists the nine carriers with links and key fields', () => {
    expect(CARRIERS.map((c) => c.id)).toEqual(['auspost', 'sendle', 'startrack', 'couriersplease', 'dhl', 'ups', 'fedex', 'shipstation', 'shippit'])
    for (const c of CARRIERS) {
      expect(c.signupUrl).toMatch(/^https:\/\//)
      expect(c.docsUrl).toMatch(/^https:\/\//)
      expect(c.fields.length).toBeGreaterThan(0)
      expect(c.keysHelp.length).toBeGreaterThan(10)
    }
    expect(carrierDef('sendle')?.live).toEqual({ rates: true, labels: true })
    expect(missingCredentialKeys(carrierDef('sendle')!, { sendleId: 'a' })).toEqual(['apiKey'])
  })
  it('packs into the smallest box, or splits by weight', () => {
    const presets = normalisePresets([
      { name: 'Small', lengthCm: 20, widthCm: 15, heightCm: 10, maxWeightKg: 1, tareKg: 0.1 },
      { name: 'Large', lengthCm: 40, widthCm: 30, heightCm: 20, maxWeightKg: 5, tareKg: 0.3 },
      { name: 'bad' },
    ])
    expect(presets).toHaveLength(2)
    expect(packItems([{ quantity: 1, weightKg: 0.5 }], presets)).toEqual([{ weightKg: 0.6, lengthCm: 20, widthCm: 15, heightCm: 10 }])
    expect(packItems([{ quantity: 2, weightKg: 1.5 }], presets)).toEqual([{ weightKg: 3.3, lengthCm: 40, widthCm: 30, heightCm: 20 }])
    const many = packItems([{ quantity: 4, weightKg: 2 }], presets)
    expect(many).toHaveLength(2)
    expect(many.map((p) => p.weightKg)).toEqual([4.3, 4.3])
    expect(packItems([], presets)).toEqual([])
    expect(packItems([{ quantity: 1 }], [])[0].lengthCm).toBe(30) // default box
    expect(normalisePresets('not json')).toEqual([])
    expect(cubicWeightKg({ weightKg: 1, lengthCm: 40, widthCm: 30, heightCm: 20 })).toBe(6)
  })
  it('reads shipping settings into one config', () => {
    const cfg = normaliseShippingConfig({
      origin: { line1: '1 St', city: 'Sydney', postcode: '2000', country: 'AU' },
      rates: { liveRates: true, handlingFlat: 2, handlingPct: 10 },
      carrierSendle: { enabled: true, testMode: false, sendleId: 'id', apiKey: 'key' },
      packages: JSON.stringify([{ name: 'B', lengthCm: 10, widthCm: 10, heightCm: 10, maxWeightKg: 2 }]),
    })
    expect(cfg.liveRates).toBe(true)
    expect(cfg.presets).toHaveLength(1)
    const sendle = cfg.carriers.find((c) => c.id === 'sendle')!
    expect(sendle).toMatchObject({ enabled: true, creds: { testMode: false, values: { sendleId: 'id', apiKey: 'key' } } })
    expect(cfg.carriers.find((c) => c.id === 'auspost')!.enabled).toBe(false)
    expect(withHandling(1000, cfg)).toBe(1100 + 200)
  })
  const config = () =>
    normaliseShippingConfig({
      origin: { line1: '1 St', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
      rates: { liveRates: true },
      carrierSendle: { enabled: true, sendleId: 'x', apiKey: 'y' },
    })
  const dest = { city: 'Perth', state: 'WA', postcode: '6000', country: 'AU' }
  it('gets live quotes through the adapter and prices them as options', async () => {
    const mock = new MockCarrierAdapter()
    const out = await fetchLiveRates(config(), { destination: dest, items: [{ quantity: 1, weightKg: 1 }], adapterFor: () => mock })
    expect(out.errors).toEqual([])
    expect(out.options.map((o) => o.id)).toEqual(['live:sendle:STD', 'live:sendle:EXP'])
    expect(out.options[0].title).toContain('Sendle')
    expect(out.options[0].costCents).toBeGreaterThan(0)
    expect(mock.calls[0].method).toBe('getRates')
  })
  it('falls back (no options, error recorded) when the carrier fails, and when it is off', async () => {
    const mock = new MockCarrierAdapter()
    mock.failWith = 'carrier down'
    const failed = await fetchLiveRates(config(), { destination: dest, items: [{ quantity: 1, weightKg: 1 }], adapterFor: () => mock })
    expect(failed.options).toEqual([])
    expect(failed.errors).toEqual([{ carrier: 'sendle', message: 'carrier down' }])
    const off = normaliseShippingConfig({ origin: { line1: '1', city: 'a', postcode: '2000' }, rates: { liveRates: false }, carrierSendle: { enabled: true } })
    expect((await fetchLiveRates(off, { destination: dest, items: [{ quantity: 1 }], adapterFor: () => new MockCarrierAdapter() })).attempted).toBe(0)
    const noOrigin = normaliseShippingConfig({ rates: { liveRates: true }, carrierSendle: { enabled: true } })
    expect((await fetchLiveRates(noOrigin, { destination: dest, items: [{ quantity: 1 }], adapterFor: () => new MockCarrierAdapter() })).attempted).toBe(0)
  })
  it('keeps pickup and free-over zone options beside live ones, and returns zone options when live is empty', () => {
    const zone = [
      { id: '1:0', zoneId: 1, zoneName: 'AU', type: 'flat' as const, title: 'Flat', costCents: 900, taxable: true },
      { id: '1:1', zoneId: 1, zoneName: 'AU', type: 'local_pickup' as const, title: 'Pickup', costCents: 0, taxable: false },
      { id: '1:2', zoneId: 1, zoneName: 'AU', type: 'free_over_amount' as const, title: 'Free', costCents: 0, taxable: true },
    ]
    const live = [{ id: liveOptionId('sendle', 'STD'), zoneId: 'live', zoneName: 'Sendle', type: 'flat' as const, title: 'Sendle', costCents: 1200, taxable: true }]
    expect(mergeShippingOptions(zone, live).map((o) => o.id)).toEqual(['live:sendle:STD', '1:1', '1:2'])
    expect(mergeShippingOptions(zone, [])).toBe(zone)
    expect(parseLiveOptionId('live:sendle:STANDARD-PICKUP')).toEqual({ carrier: 'sendle', serviceCode: 'STANDARD-PICKUP' })
    expect(parseLiveOptionId('1:0')).toBeNull()
  })
  it('the mock buys a label and lodges a manifest', async () => {
    const mock = new MockCarrierAdapter()
    const label = await mock.createLabel({ values: {}, testMode: true }, { reference: '42', serviceCode: 'STD', origin: {}, destination: {}, parcels: [{ weightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 }] })
    expect(label.trackingNumber).toBe('MOCK000042STD')
    expect(await mock.endOfDayManifest!({ values: {}, testMode: true }, [{ trackingNumber: label.trackingNumber, reference: '42' }])).toMatchObject({ ok: true })
  })
  it('real adapters without keys say so, keys-only carriers test their fields', async () => {
    expect((await new SendleAdapter().testConnection({ values: {}, testMode: true })).ok).toBe(false)
    expect((await new AusPostAdapter().testConnection({ values: {}, testMode: true })).message).toMatch(/PAC API key/)
    const ups = await getAdapter('ups').testConnection({ values: { clientId: 'a' }, testMode: true })
    expect(ups).toEqual({ ok: false, message: expect.stringContaining('clientSecret') })
    const full = await getAdapter('shippit').testConnection({ values: { apiKey: 'k' }, testMode: true })
    expect(full.ok).toBe(true)
    await expect(getAdapter('dhl').createLabel({} as never, {} as never)).rejects.toThrow(/not built in/)
  })
})

describe('Sendle and Australia Post over a fake network', () => {
  const real = http.fetch
  let seen: { url: string; init?: RequestInit }[] = []
  beforeEach(() => {
    seen = []
  })
  afterEach(() => {
    http.fetch = real
  })
  const answer = (status: number, body: unknown) => {
    http.fetch = async (url, init) => {
      seen.push({ url, init })
      return new Response(JSON.stringify(body), { status })
    }
  }
  const req = { origin: { line1: '1', city: 'Sydney', postcode: '2000', country: 'AU' }, destination: { name: 'Al', line1: '2', city: 'Perth', postcode: '6000', state: 'WA', country: 'AU' }, parcels: [{ weightKg: 1, lengthCm: 20, widthCm: 10, heightCm: 5 }] }
  it('Sendle: quotes, authenticates with Basic and uses the sandbox in test mode', async () => {
    answer(200, [{ plan_name: 'Standard', product: { code: 'STANDARD-PICKUP', name: 'Standard Pickup' }, quote: { gross: { amount: 12.34 } }, eta: { days_range: [3, 5] } }, { junk: true }])
    const quotes = await new SendleAdapter().getRates({ values: { sendleId: 'sid', apiKey: 'k' }, testMode: true }, req)
    expect(quotes).toEqual([{ carrier: 'sendle', serviceCode: 'STANDARD-PICKUP', serviceName: 'Standard Pickup', costCents: 1234, etaDays: 5 }])
    expect(seen[0].url).toMatch(/^https:\/\/sandbox\.sendle\.com\/api\/quote\?/)
    expect((seen[0].init?.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('sid:k')}`)
  })
  it('Sendle: rejected keys are a clear error', async () => {
    answer(401, {})
    await expect(new SendleAdapter().getRates({ values: { sendleId: 's', apiKey: 'k' }, testMode: false }, req)).rejects.toThrow(/did not accept/)
    expect(await new SendleAdapter().testConnection({ values: { sendleId: 's', apiKey: 'k' }, testMode: false })).toEqual({ ok: false, message: expect.stringMatching(/did not accept/) })
  })
  it('Sendle: creates an order and returns tracking and the label', async () => {
    answer(201, { order_id: 'abc', sendle_reference: 'S123', tracking_url: 'https://track/x', labels: [{ format: 'pdf', url: 'https://labels/x.pdf' }], price: { gross: { amount: 9.5 } } })
    const label = await new SendleAdapter().createLabel({ values: { sendleId: 's', apiKey: 'k' }, testMode: false }, { ...req, reference: '7', serviceCode: 'STANDARD-PICKUP' })
    expect(label).toMatchObject({ trackingNumber: 'S123', labelUrl: 'https://labels/x.pdf', carrierRef: 'abc', costCents: 950 })
    const sent = JSON.parse(String(seen[0].init?.body))
    expect(sent.product_code).toBe('STANDARD-PICKUP')
    expect(sent.weight).toEqual({ value: '1', units: 'kg' })
  })
  it('Sendle: a refusal or a response with no tracking is an error', async () => {
    answer(422, { error_description: 'bad postcode' })
    await expect(new SendleAdapter().createLabel({ values: { sendleId: 's', apiKey: 'k' }, testMode: true }, { ...req, reference: '7', serviceCode: 'X' })).rejects.toThrow(/bad postcode/)
    answer(201, { order_id: 'abc' })
    await expect(new SendleAdapter().createLabel({ values: { sendleId: 's', apiKey: 'k' }, testMode: true }, { ...req, reference: '7', serviceCode: 'X' })).rejects.toThrow(/tracking/)
  })
  it('Australia Post PAC: sums services across parcels', async () => {
    answer(200, { services: { service: [{ code: 'AUS_PARCEL_REGULAR', name: 'Parcel Post', price: '10.50' }, { code: 'AUS_PARCEL_EXPRESS', name: 'Express Post', price: '15.00' }] } })
    const two = { ...req, parcels: [req.parcels[0], req.parcels[0]] }
    const quotes = await new AusPostAdapter().getRates({ values: { pacKey: 'key' }, testMode: false }, two)
    expect(quotes.map((q) => [q.serviceCode, q.costCents])).toEqual([['AUS_PARCEL_REGULAR', 2100], ['AUS_PARCEL_EXPRESS', 3000]])
    expect((seen[0].init?.headers as Record<string, string>)['AUTH-KEY']).toBe('key')
    await expect(new AusPostAdapter().getRates({ values: { pacKey: 'key' }, testMode: false }, { ...req, destination: { ...req.destination, country: 'NZ' } })).rejects.toThrow(/Australian/)
    await expect(new AusPostAdapter().createLabel({ values: {}, testMode: true }, { ...req, reference: '1', serviceCode: 'x' })).rejects.toThrow(/not connected/)
  })
})

describe('driver manifest', () => {
  const orders = [
    {
      id: 7,
      orderNumber: '1007',
      shippingAddress: { firstName: 'Ann', lastName: 'Lee', addressLine1: '1 High St', city: 'Perth', state: 'WA', postalCode: '6000', country: 'AU', phone: '0400 000 000' },
      lineItems: [{ name: 'Tee <b>', sku: 'T1', quantity: 2 }],
      shipments: [{ carrier: 'sendle', service: 'Standard', trackingNumber: 'S123-A', weightKg: 1.2 }],
    },
    { id: 8, shippingAddress: { firstName: '=cmd' }, lineItems: [{ name: 'Hat', quantity: 1 }], shipments: [{ carrier: 'auspost', trackingNumber: 'AP9', weightKg: 0.5, manifestId: 3 }] },
    { id: 9, lineItems: [] as unknown[], shipments: [] as unknown[] },
  ]
  it('lists only labelled, not yet manifested parcels, optionally for one carrier', () => {
    expect(unmanifested(orders[1])).toEqual([])
    const m = buildManifest(orders, { number: 'M-1', date: '2026-10-14' })
    expect(m.rows).toHaveLength(1)
    expect(m.totals).toEqual({ orders: 1, parcels: 1, items: 2, weightKg: 1.2 })
    expect(buildManifest(orders, { number: 'M-2', date: 'd', carrier: 'auspost' }).rows).toHaveLength(0)
    expect(buildManifest(orders, { number: 'M-3', date: 'd', onlyUnmanifested: false }).rows).toHaveLength(2)
  })
  it('renders printable HTML with a barcode, a signature column and escaped text', () => {
    const html = renderManifestHtml(buildManifest(orders, { number: 'M-1', date: '2026-10-14' }), { storeName: 'Shop & Co', unitSystem: 'metric' })
    expect(html).toContain('Driver manifest M-1')
    expect(html).toContain('Signature')
    expect(html).toContain('<svg')
    expect(html).toContain('S123-A')
    expect(html).toContain('Shop &amp; Co')
    expect(html).toContain('Tee &lt;b&gt;')
    expect(html).not.toContain('Tee <b>')
    expect(html).toContain('1.2 kg')
    expect(renderManifestHtml(buildManifest(orders, { number: 'M-1', date: 'd' }), { storeName: 'S', unitSystem: 'imperial' })).toContain('2.646 lb')
  })
  it('exports CSV that cannot run formulas', () => {
    const csv = manifestCsv(buildManifest(orders, { number: 'M-1', date: '2026-10-14', onlyUnmanifested: false }))
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toContain('Tracking number')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('"1 High St, Perth WA 6000, AU"')
    expect(lines[2]).toContain("'=cmd")
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell('@x')).toBe("'@x")
  })
  it('Code 39 patterns are well formed', () => {
    for (const [ch, p] of Object.entries(code39Patterns)) {
      expect(p, ch).toHaveLength(9)
      expect([...p].filter((c) => c === 'w'), ch).toHaveLength(3)
    }
    expect(Object.keys(code39Patterns)).toHaveLength(44)
    expect(code39Text('ab-12 x!')).toBe('AB-12 X')
    expect(code39Svg('!!!')).toBe('')
    expect(code39Svg('ABC')).toMatch(/^<svg/)
  })
})

describe('invoice settings', () => {
  const order = {
    id: 42,
    orderNumber: '1042',
    status: 'processing',
    amount: 1100,
    subtotal: 1100,
    taxTotal: 100,
    pricesIncludeTax: true,
    taxLines: [{ name: 'GST', ratePct: 10, taxCents: 100 }],
    giftCardTotal: 300,
    shippingAddress: { firstName: 'A', addressLine1: '1 St' },
    lineItems: [{ name: 'Tee', sku: 'T1', quantity: 1, unitCents: 1100, lineCents: 1100, taxCents: 100 }],
  }
  const store = { name: 'S', abn: '12 345 678 901' }
  it('cleans everything that lands in the page', () => {
    const s = normaliseInvoiceSettings({ accentColor: 'red;}</style><script>', textColor: '#abc', fontSize: 500, fontFamily: 'comic', logoUrl: 'javascript:alert(1)', paperSize: 'Legal', titleMode: 'x', numberPrefix: 'A<B>-' })
    expect(s.accentColor).toBe('#111111')
    expect(s.textColor).toBe('#abc')
    expect(s.fontSize).toBe(20)
    expect(s.fontFamily).toBe('sans')
    expect(s.logoUrl).toBe('')
    expect(s.paperSize).toBe('A4')
    expect(s.titleMode).toBe('auto')
    expect(s.numberPrefix).toBe('AB-')
    expect(safeLogoUrl('https://x.test/logo.png')).toBe('https://x.test/logo.png')
    expect(safeLogoUrl('/uploads/logo.png')).toBe('/uploads/logo.png')
    expect(safeLogoUrl('//evil.test/x.png')).toBe('')
    expect(safeLogoUrl('https://x.test/a"onload=1')).toBe('')
  })
  it('numbers invoices from the prefix, padding and next number', () => {
    expect(formatInvoiceNumber({ numberPrefix: 'INV-', numberPadding: 5 }, 42)).toBe('INV-00042')
    expect(formatInvoiceNumber({ numberPrefix: 'T', numberPadding: 0 }, 7)).toBe('T7')
  })
  it('picks the title: tax invoice, invoice or receipt', () => {
    const s = normaliseInvoiceSettings({})
    expect(documentTitle(s, order)).toBe('Tax invoice')
    expect(documentTitle(s, { taxTotal: 0, taxLines: [] })).toBe('Invoice')
    expect(documentTitle(normaliseInvoiceSettings({ titleMode: 'receipt', receiptTitle: 'Payment receipt' }), order)).toBe('Payment receipt')
  })
  it('applies title, colours, columns, header, footer and paper size', () => {
    const html = renderInvoiceHtml(order, store, { titleMode: 'receipt', accentColor: '#ff0000', paperSize: 'Letter', showSku: false, showTax: false, headerText: 'Thanks <3', footerText: 'ABN on file', terms: 'Net 7', logoUrl: 'https://x.test/l.png', numberPrefix: 'R-' })
    expect(html).toContain('<h1>Receipt</h1>')
    expect(html).toContain('#ff0000')
    expect(html).toContain('size: Letter')
    expect(html).not.toContain('SKU T1')
    expect(html).not.toContain('<th class="num">Tax</th>')
    expect(html).toContain('Thanks &lt;3')
    expect(html).toContain('ABN on file')
    expect(html).toContain('Net 7')
    expect(html).toContain('<img class="logo" src="https://x.test/l.png"')
    expect(html).toContain('R-00042')
    expect(html).toContain('Order #1042')
    expect(html).toContain('Paid with gift card')
  })
  it('keeps the stored invoice number once issued', () => {
    expect(renderInvoiceHtml({ ...order, invoiceNumber: 'INV-00007' }, store)).toContain('INV-00007')
  })
  it('default output is unchanged', () => {
    const html = renderInvoiceHtml(order, store)
    expect(html).toContain('<h1>Tax invoice</h1>')
    expect(html).toContain('size: A4')
    expect(renderPackingSlipHtml(order, store, { packingSlipNote: 'Hand wash <only>' })).toContain('Hand wash &lt;only&gt;')
  })
})

describe('order email templates', () => {
  const order = { id: 5, orderNumber: '1005', status: 'processing', amount: 5000, shippingAddress: { firstName: 'Ann' }, trackingNumber: 'T-1', trackingCarrier: 'Sendle', trackingUrl: 'https://track/1' }
  it('uses the built-in text, then a per-status template, escaping values in HTML', () => {
    const plain = renderOrderEmail('processing', order, {})
    expect(plain.subject).toContain('#5')
    const custom = renderOrderEmail('processing', { ...order, shippingAddress: { firstName: '<b>X</b>' } }, { template: { subject: 'Hi {{customer_name}} #{{order_number}}', body: 'Total {{order_total}}' } })
    expect(custom.subject).toBe('Hi <b>X</b> #1005')
    expect(custom.html).toContain('Total $50.00')
    expect(custom.html).not.toContain('<b>X</b>')
  })
  it('the shipped email carries carrier and tracking', () => {
    const mail = renderOrderEmail('shipped', order, {})
    expect(mail.text).toContain('T-1')
    expect(mail.text).toContain('Sendle')
    expect(mail.text).toContain('https://track/1')
  })
  it('reads blank template fields as unset', () => {
    expect(templateFor({ processingSubject: '  ', processingBody: 'x' }, 'processing')).toEqual({ subject: undefined, body: 'x' })
    expect(templateFor(null, 'completed')).toEqual({ subject: undefined, body: undefined })
  })
})

describe('product feeds', () => {
  const base = 'https://shop.test'
  const media = { url: '/media/a.jpg' }
  const products = [
    { id: 1, title: 'Tee & Co', slug: 'tee', productType: 'simple', priceInAUD: 30, salePrice: 25, shortDescription: 'Soft <tee>', images: [media], sku: 'TEE1', manageStock: true, stockQty: 3, category: 'physical' },
    { id: 2, title: 'Dress', slug: 'dress', productType: 'variable', priceInAUD: 100, images: [media, { url: 'https://cdn.test/b.jpg' }], variations: [
      { id: 'v1', attributeValues: 'Colour=Red|Size=M', sku: 'D-R-M', enabled: true, manageStock: true, stockQty: 0 },
      { id: 'v2', attributeValues: 'Colour=Blue|Size=L', enabled: true, priceInAUD: 90 },
      { id: 'v3', attributeValues: 'Colour=Off', enabled: false },
    ] },
    { id: 3, title: 'No image', slug: 'ni', priceInAUD: 5 },
    { id: 4, title: 'No price', slug: 'np', images: [media] },
    { id: 5, title: 'Ext', slug: 'ext', productType: 'external', priceInAUD: 5, images: [media] },
  ]
  const items = buildFeedItems(products, { baseUrl: base, currency: 'AUD', brand: 'Grace' })
  it('builds one row per product and per enabled variation, skipping unusable ones', () => {
    expect(items.map((i) => i.id)).toEqual(['TEE1', 'D-R-M', '2-v2'])
    expect(items[0]).toMatchObject({ price: '30.00 AUD', salePrice: '25.00 AUD', availability: 'in stock', imageLink: 'https://shop.test/media/a.jpg', link: 'https://shop.test/shop/tee' })
    expect(items[1]).toMatchObject({ availability: 'out of stock', color: 'Red', size: 'M', groupId: '2' })
    expect(items[2]).toMatchObject({ price: '90.00 AUD', color: 'Blue', size: 'L', title: 'Dress - Blue, L' })
  })
  it('writes Google Merchant XML with escaping', () => {
    const xml = googleMerchantXml(items, { title: 'Shop', link: base, description: 'Feed' })
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"')
    expect(xml).toContain('<g:id>TEE1</g:id>')
    expect(xml).toContain('Tee &amp; Co')
    expect(xml).toContain('<g:sale_price>25.00 AUD</g:sale_price>')
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>')
    expect(xml).not.toContain('Soft <tee>')
  })
  it('writes the Meta catalogue CSV', () => {
    const csv = metaCatalogCsv(items).trim().split('\r\n')
    expect(csv[0].startsWith('id,title,description,availability,condition,price,link,image_link,brand')).toBe(true)
    expect(csv).toHaveLength(4)
    expect(csv[1].startsWith('TEE1,Tee & Co,')).toBe(true)
  })
  it('turns rich text into plain text', () => {
    expect(plainText({ root: { children: [{ type: 'paragraph', children: [{ text: 'Hello' }, { text: ' world' }] }, { type: 'paragraph', children: [{ text: 'Two' }] }] } })).toBe('Hello world Two')
    expect(plainText(null)).toBe('')
  })
})
