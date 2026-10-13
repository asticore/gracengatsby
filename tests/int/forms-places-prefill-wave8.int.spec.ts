import { describe, expect, it, vi } from 'vitest'

import { prefillFromSearch, computePrefill } from '@/features/forms/prefill'
import { readPlacesBrowserKey } from '@/features/forms/placesKey'
import { parsePlaceAddress } from '@/features/forms/placesParse'
import type { FormFieldDef } from '@/features/forms/types'

const AU_PLACE = [
  { long_name: '12', short_name: '12', types: ['street_number'] },
  { long_name: 'George Street', short_name: 'George St', types: ['route'] },
  { long_name: 'Sydney', short_name: 'Sydney', types: ['locality', 'political'] },
  { long_name: 'New South Wales', short_name: 'NSW', types: ['administrative_area_level_1'] },
  { long_name: '2000', short_name: '2000', types: ['postal_code'] },
  { long_name: 'Australia', short_name: 'AU', types: ['country'] },
]

describe('parsePlaceAddress (Google address_components -> form fields)', () => {
  it('maps a full Australian address', () => {
    expect(parsePlaceAddress(AU_PLACE, '12 George St, Sydney NSW 2000, Australia')).toEqual({
      line1: '12 George Street',
      city: 'Sydney',
      region: 'New South Wales',
      postcode: '2000',
      country: 'Australia',
    })
  })

  it('uses postal_town and sublocality for the city when locality is absent', () => {
    expect(parsePlaceAddress([{ long_name: 'London', types: ['postal_town'] }]).city).toBe('London')
    expect(parsePlaceAddress([{ long_name: 'Newtown', types: ['sublocality_level_1'] }]).city).toBe('Newtown')
  })

  it('falls back to the first part of the formatted address when there is no street', () => {
    const parsed = parsePlaceAddress([{ long_name: 'Sydney', types: ['locality'] }], 'Central Park, Sydney NSW, Australia')
    expect(parsed.line1).toBe('Central Park')
    expect(parsed.city).toBe('Sydney')
  })

  it('keeps empty parts empty and never throws on bad input', () => {
    expect(parsePlaceAddress(undefined)).toEqual({ line1: '', city: '', region: '', postcode: '', country: '' })
    expect(parsePlaceAddress([null, 'x', 7, { types: 'route', long_name: 'Nope' }, { long_name: 'Ignored', types: ['route'] }])).toMatchObject({ line1: 'Ignored' })
    expect(parsePlaceAddress([{ long_name: '  ', types: ['postal_code'] }]).postcode).toBe('')
  })

  it('uses long names, not short ones', () => {
    expect(parsePlaceAddress(AU_PLACE).region).toBe('New South Wales')
    expect(parsePlaceAddress(AU_PLACE).country).toBe('Australia')
  })
})

const field = (overrides: Partial<FormFieldDef>): FormFieldDef => ({ id: 'x', type: 'text', name: 'plan', ...overrides } as FormFieldDef)

describe('prefillFromSearch (page address prefill, browser side)', () => {
  const fields = [
    field({ name: 'plan', prefillKey: 'plan', type: 'select', options: [{ label: 'Pro', value: 'pro' }] }),
    field({ name: 'company', prefillKey: 'company' }),
    field({ name: 'price', prefillKey: 'price' }),
    field({ name: 'notes' }),
  ]

  it('fills only whitelisted keys that the query carries', () => {
    const found = prefillFromSearch(fields, ['plan', 'company'], '?plan=pro&company=Acme&price=0&notes=hi')
    expect(found).toEqual({ plan: 'pro', company: 'Acme' })
  })

  it('applies the same rules as the server: choice must match an option, no whitelist means nothing', () => {
    expect(prefillFromSearch(fields, ['plan'], '?plan=enterprise')).toEqual({})
    expect(prefillFromSearch(fields, undefined, '?plan=pro')).toEqual({})
    expect(prefillFromSearch(fields, [], '?plan=pro')).toEqual({})
  })

  it('takes the first value of a repeated key and trims and bounds it', () => {
    expect(prefillFromSearch(fields, ['company'], '?company=A&company=B')).toEqual({ company: 'A' })
    const long = 'x'.repeat(900)
    expect(prefillFromSearch(fields, ['company'], `?company=${long}`).company).toHaveLength(500)
  })

  it('does not reach inherited object properties', () => {
    const inherited = [field({ name: 'constructor', prefillKey: 'constructor' }), field({ name: 'toString', prefillKey: 'toString' })]
    expect(prefillFromSearch(inherited, ['constructor', 'toString'], '?company=Acme')).toEqual({})
    expect(prefillFromSearch(inherited, ['constructor', 'toString'], '?constructor=x')).toEqual({ constructor: 'x' })
    expect(prefillFromSearch(inherited, ['constructor'], '?toString=x')).toEqual({})
  })
})

describe('readPlacesBrowserKey (the only key a public form may receive)', () => {
  const engineWith = (integrations: unknown) => {
    const findGlobal = vi.fn(async () => integrations)
    return { findGlobal }
  }

  it('sends nothing when no field on the form uses Places', async () => {
    const engine = engineWith({ google: { mapsApiKey: 'browser-key' } })
    expect(await readPlacesBrowserKey(engine, [{ addressLookup: 'nominatim' }, { addressLookup: 'none' }])).toBeUndefined()
    expect(engine.findGlobal).not.toHaveBeenCalled()
  })

  it('returns the trimmed Maps key, reading only the integrations global with access overridden', async () => {
    const engine = engineWith({ google: { mapsApiKey: '  browser-key  ', ga4MeasurementId: 'G-1' }, claudeApiKey: 'secret' })
    expect(await readPlacesBrowserKey(engine, [{ addressLookup: 'google' }])).toBe('browser-key')
    expect(engine.findGlobal).toHaveBeenCalledWith({ slug: 'integrations', depth: 0, overrideAccess: true })
  })

  it('returns undefined when the key is blank, missing or the read fails', async () => {
    const fields = [{ addressLookup: 'google' }]
    expect(await readPlacesBrowserKey(engineWith({ google: { mapsApiKey: '   ' } }), fields)).toBeUndefined()
    expect(await readPlacesBrowserKey(engineWith({}), fields)).toBeUndefined()
    const broken = { findGlobal: vi.fn(() => Promise.reject(new Error('db down'))) }
    expect(await readPlacesBrowserKey(broken, fields)).toBeUndefined()
  })
})
