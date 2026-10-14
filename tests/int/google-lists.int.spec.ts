// @vitest-environment node
/**
 * The mapping from Google's answers to dropdown choices, the status reducer,
 * and the checks on what the admin screen may save. No network, no database.
 */
import { describe, expect, it } from 'vitest'

import {
  mapAdsenseAccounts,
  mapGa4Properties,
  mapSearchConsoleSites,
  mapTagManagerContainers,
  measurementIdFrom,
  parseTagManagerValue,
  publisherIdFrom,
} from '@/features/google/lists'
import { toConnectionStatus } from '@/features/google/status'
import { redirectUriFor } from '@/features/google/constants'
import { validateClientInput } from '@/features/google/connectionSave'
import { parsePickBody } from '@/features/google/picks'

describe('Analytics property list', () => {
  it('lists each property with its bare number as the value', () => {
    const items = mapGa4Properties({
      accountSummaries: [
        { account: 'accounts/1', propertySummaries: [{ property: 'properties/4242', displayName: 'Grace site' }] },
        { account: 'accounts/2', propertySummaries: [{ property: 'properties/99', displayName: '' }] },
      ],
    })
    expect(items).toEqual([
      { value: '4242', label: 'Grace site (4242)' },
      { value: '99', label: 'Property (99)' },
    ])
  })

  it('skips anything that is not a numeric property', () => {
    expect(mapGa4Properties({ accountSummaries: [{ propertySummaries: [{ property: 'properties/abc' }] }] })).toEqual([])
    expect(mapGa4Properties(null)).toEqual([])
  })
})

describe('Search Console list', () => {
  it('uses the site address as both value and label', () => {
    expect(mapSearchConsoleSites({ siteEntry: [{ siteUrl: 'https://gracengatsby.com/', permissionLevel: 'siteOwner' }] })).toEqual([
      { value: 'https://gracengatsby.com/', label: 'https://gracengatsby.com/' },
    ])
  })
})

describe('Tag Manager list', () => {
  it('keys each container by account and container ID and shows the GTM ID', () => {
    const items = mapTagManagerContainers([
      {
        accountId: '555',
        accountName: 'Studio',
        json: { container: [{ containerId: '777', name: 'Website', publicId: 'GTM-ABCD123' }, { containerId: 'x', publicId: 'GTM-BAD' }] },
      },
    ])
    expect(items).toEqual([{ value: '555/777', label: 'Studio: Website (GTM-ABCD123)' }])
  })

  it('parses only a strict account/container value', () => {
    expect(parseTagManagerValue('555/777')).toEqual({ accountId: '555', containerId: '777' })
    expect(parseTagManagerValue('555/777/9')).toBeNull()
    expect(parseTagManagerValue('../777')).toBeNull()
    expect(parseTagManagerValue('555')).toBeNull()
  })
})

describe('AdSense list', () => {
  it('keeps only publisher account names and derives the publisher ID', () => {
    const items = mapAdsenseAccounts({
      accounts: [
        { name: 'accounts/pub-1234567890', displayName: 'Main' },
        { name: 'accounts/other', displayName: 'Bad' },
      ],
    })
    expect(items).toEqual([{ value: 'accounts/pub-1234567890', label: 'Main (accounts/pub-1234567890)' }])
    expect(publisherIdFrom('accounts/pub-1234567890')).toBe('pub-1234567890')
  })
})

describe('measurement ID from data streams', () => {
  it('takes the first web stream that has a G- ID', () => {
    expect(
      measurementIdFrom({
        dataStreams: [{ type: 'ANDROID_APP_DATA_STREAM' }, { webStreamData: { measurementId: 'G-ABC123XYZ' } }],
      }),
    ).toBe('G-ABC123XYZ')
    expect(measurementIdFrom({ dataStreams: [{ webStreamData: { measurementId: 'UA-1' } }] })).toBe('')
    expect(measurementIdFrom({})).toBe('')
  })
})

describe('connection status', () => {
  it('reports presence of secrets without returning them', () => {
    const status = toConnectionStatus({
      clientId: ' 1.apps.googleusercontent.com ',
      clientSecretEnc: 'shh',
      refreshTokenEnc: 'refresh',
      connectedEmail: 'owner@example.com',
      ga4MeasurementId: 'G-ABC123XYZ',
    })
    expect(status).toMatchObject({ clientId: '1.apps.googleusercontent.com', hasClientSecret: true, connected: true, connectedEmail: 'owner@example.com' })
    expect(JSON.stringify(status)).not.toContain('shh')
    expect(JSON.stringify(status)).not.toContain('refresh')
  })

  it('is empty and not connected for a missing row', () => {
    expect(toConnectionStatus(null)).toMatchObject({ clientId: '', hasClientSecret: false, connected: false })
  })
})

describe('redirect address', () => {
  it('is the site origin plus the callback path, with no double slash', () => {
    expect(redirectUriFor('https://gracengatsby.com/')).toBe('https://gracengatsby.com/api/google/callback')
  })
})

describe('client form checks', () => {
  it('accepts a Google client ID and an empty secret (keep the saved one)', () => {
    expect(validateClientInput({ clientId: '123456-abcdef.apps.googleusercontent.com', clientSecret: '' })).toEqual({
      ok: true,
      clientId: '123456-abcdef.apps.googleusercontent.com',
      clientSecret: null,
    })
  })

  it('refuses a client ID that is not a Google client', () => {
    expect(validateClientInput({ clientId: 'not-a-client' })).toMatchObject({ ok: false })
    expect(validateClientInput({ clientId: 'x.apps.googleusercontent.com.evil.example' })).toMatchObject({ ok: false })
    expect(validateClientInput({})).toMatchObject({ ok: false })
  })

  it('refuses a secret with spaces or that is too short', () => {
    expect(validateClientInput({ clientId: '123456-abcdef.apps.googleusercontent.com', clientSecret: 'has space here' })).toMatchObject({ ok: false })
    expect(validateClientInput({ clientId: '123456-abcdef.apps.googleusercontent.com', clientSecret: 'short' })).toMatchObject({ ok: false })
  })
})

describe('picker request body', () => {
  it('accepts the four known kinds with a bounded value', () => {
    expect(parsePickBody({ kind: 'ga4', value: '4242' })).toEqual({ kind: 'ga4', value: '4242' })
    expect(parsePickBody({ kind: 'gtm', value: '555/777' })).toEqual({ kind: 'gtm', value: '555/777' })
  })

  it('refuses an unknown kind, a missing value or an oversized value', () => {
    expect(parsePickBody({ kind: 'drive', value: 'x' })).toBeNull()
    expect(parsePickBody({ kind: 'ga4' })).toBeNull()
    expect(parsePickBody({ kind: 'gsc', value: 'a'.repeat(301) })).toBeNull()
    expect(parsePickBody(null)).toBeNull()
  })
})
