// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { pickPublicIds } from '@/features/integrations/publicIds'

describe('pickPublicIds', () => {
  it('returns nothing when neither global has a row', () => {
    expect(pickPublicIds(null, null)).toEqual({})
  })

  it('reads the Integrations global first', () => {
    const ids = pickPublicIds(
      {
        google: { ga4MeasurementId: ' G-NEW ', gtmContainerId: 'GTM-NEW', searchConsoleVerification: 'verify-new' },
        metaPixel: { pixelId: '123' },
        clarity: { projectId: 'abc' },
      },
      { analytics: { ga4MeasurementId: 'G-OLD', gtmContainerId: 'GTM-OLD', metaPixelId: '999' }, verification: { google: 'verify-old' } },
    )
    expect(ids).toEqual({
      ga4MeasurementId: 'G-NEW',
      gtmContainerId: 'GTM-NEW',
      metaPixelId: '123',
      searchConsoleVerification: 'verify-new',
      clarityProjectId: 'abc',
    })
  })

  it('falls back field by field to the old SEO & Analytics values', () => {
    const ids = pickPublicIds(
      { google: { ga4MeasurementId: '', gtmContainerId: null }, metaPixel: {}, clarity: { projectId: 'abc' } },
      { analytics: { ga4MeasurementId: 'G-OLD', gtmContainerId: 'GTM-OLD', metaPixelId: '999' }, verification: { google: 'verify-old' } },
    )
    expect(ids).toEqual({
      ga4MeasurementId: 'G-OLD',
      gtmContainerId: 'GTM-OLD',
      metaPixelId: '999',
      searchConsoleVerification: 'verify-old',
      clarityProjectId: 'abc',
    })
  })

  it('never returns secret fields', () => {
    const ids = pickPublicIds({ google: { mapsApiKey: 'secret' }, recaptcha: { secretKey: 'x' }, claudeApiKey: 'y' }, null)
    expect(JSON.stringify(ids)).not.toMatch(/secret|"x"|"y"/)
  })
})
