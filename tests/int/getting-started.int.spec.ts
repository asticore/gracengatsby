import { describe, expect, it } from 'vitest'
import { computeProgress, type GetStartedData } from '@/features/gettingStarted/compute'

describe('getting-started compute', () => {
  it('returns 0% when no data and no manual done', () => {
    const progress = computeProgress({})
    expect(progress.percent).toBe(0)
    expect(progress.done).toBe(0)
  })

  it('returns 100% when all items are manually marked', () => {
    const manualIds = new Set([
      'site-name-logo',
      'header',
      'footer',
      'social-links',
      'first-page',
      'seo-basics',
      'connect-google',
      'email-provider',
      'payments',
      'security',
      'backups-enabled',
      'custom-domain',
      'redirects',
    ])
    const progress = computeProgress({}, manualIds)
    expect(progress.percent).toBe(100)
    expect(progress.done).toBe(progress.total)
  })

  it('computes partial progress from mixed auto and manual', () => {
    const data: GetStartedData = {
      siteName: 'My Site',
      logo: { id: '1' },
      headerSocials: [{ url: 'https://x.com' }],
      pagesPublished: 1,
    }
    const manualDoneIds = new Set(['email-provider'])
    const progress = computeProgress(data, manualDoneIds)

    expect(progress.percent).toBeGreaterThan(0)
    expect(progress.percent).toBeLessThan(100)
    expect(progress.done).toBeGreaterThanOrEqual(4)
  })

  it('detects site-name-logo from BOTH siteName and logo', () => {
    const data: GetStartedData = { siteName: 'My Site', logo: { url: 'logo.png' } }
    const progress = computeProgress(data)
    expect(progress.byCategory['Site basics']?.done).toBeGreaterThanOrEqual(1)
  })

  it('does NOT detect site-name-logo from siteName alone', () => {
    const data: GetStartedData = { siteName: 'My Site' }
    const progress = computeProgress(data)
    expect(progress.byCategory['Site basics']?.done).toBe(0)
  })

  it('detects header and footer separately from socials', () => {
    const data: GetStartedData = {
      headerSocials: [{ url: 'https://twitter.com/example' }],
      footerSocials: [{ url: 'https://twitter.com/example' }],
    }
    const progress = computeProgress(data)
    const basicsDone = progress.byCategory['Site basics']?.done ?? 0
    expect(basicsDone).toBeGreaterThanOrEqual(2)
  })

  it('detects social-links from header or footer socials', () => {
    const data: GetStartedData = {
      headerSocials: [{ url: 'https://twitter.com/example' }],
    }
    const progress = computeProgress(data)
    expect(progress.byCategory['Site basics']?.done).toBeGreaterThanOrEqual(1)
  })

  it('does not detect social-links from empty arrays', () => {
    const data: GetStartedData = { headerSocials: [], footerSocials: [] }
    const progress = computeProgress(data)
    const basicsDone = progress.byCategory['Site basics']?.done ?? 0
    expect(basicsDone).toBe(0)
  })

  it('detects first-page from pagesPublished count', () => {
    const data: GetStartedData = { pagesPublished: 5 }
    const progress = computeProgress(data)
    expect(progress.byCategory['Content']?.done).toBeGreaterThanOrEqual(1)
  })

  it('detects connect-google from GA4, GTM, or Meta pixel', () => {
    const data: GetStartedData = { ga4MeasurementId: 'G-1234567890' }
    const progress = computeProgress(data)
    expect(progress.byCategory['Connect services']?.done).toBeGreaterThanOrEqual(1)
  })

  it('detects email-provider field', () => {
    const data: GetStartedData = { emailProvider: 'sendgrid' }
    const progress = computeProgress(data)
    expect(progress.byCategory['Communication']?.done).toBeGreaterThanOrEqual(1)
  })

  it('detects payments from stripe.enabled', () => {
    const data: GetStartedData = { stripeEnabled: true }
    const progress = computeProgress(data)
    expect(progress.byCategory['Shop']?.done).toBeGreaterThanOrEqual(1)
  })

  it('detects security from twoFactorEnabled', () => {
    const data: GetStartedData = { twoFactorEnabled: true }
    const progress = computeProgress(data)
    expect(progress.byCategory['Security']?.done).toBeGreaterThanOrEqual(1)
  })

  it('detects backups-enabled field', () => {
    const data: GetStartedData = { backupsEnabled: true }
    const progress = computeProgress(data)
    expect(progress.byCategory['Security']?.done).toBeGreaterThanOrEqual(1)
  })

  it('detects custom-domain field', () => {
    const data: GetStartedData = { customDomain: 'example.com' }
    const progress = computeProgress(data)
    expect(progress.byCategory['Go live']?.done).toBeGreaterThanOrEqual(1)
  })

  it('handles missing data gracefully', () => {
    const data: GetStartedData = {
      siteName: undefined,
      logo: null,
      headerSocials: null,
      pagesPublished: undefined,
    }
    const progress = computeProgress(data)
    expect(progress.percent).toBe(0)
    expect(progress.done).toBe(0)
  })

  it('provides category breakdown', () => {
    const data: GetStartedData = {
      siteName: 'Test',
      logo: { id: '1' },
      headerSocials: [{ url: 'https://x.com' }],
      pagesPublished: 1,
    }
    const progress = computeProgress(data)

    expect(progress.byCategory['Site basics']).toBeDefined()
    expect(progress.byCategory['Site basics']?.total).toBeGreaterThan(0)
    expect(progress.byCategory['Content']).toBeDefined()
    expect(progress.byCategory['Go live']).toBeDefined()
  })

  it('never goes above 100%', () => {
    const manualIds = new Set(Array.from({ length: 100 }, (_, i) => `item-${i}`))
    const progress = computeProgress({}, manualIds)
    expect(progress.percent).toBeLessThanOrEqual(100)
  })

  it('needs both siteName and logo for site-name-logo task', () => {
    const onlySiteName: GetStartedData = { siteName: 'Test' }
    const onlyLogo: GetStartedData = { logo: { id: '1' } }
    const both: GetStartedData = { siteName: 'Test', logo: { id: '1' } }

    expect(computeProgress(onlySiteName).byCategory['Site basics']?.done).toBe(0)
    expect(computeProgress(onlyLogo).byCategory['Site basics']?.done).toBe(0)
    expect(computeProgress(both).byCategory['Site basics']?.done).toBeGreaterThanOrEqual(1)
  })
})