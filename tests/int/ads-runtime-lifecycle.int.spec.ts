import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublicConfig, PublicUnit } from '@/features/ads/builders'
import { startAds } from '@/features/ads/runtime'

class FakeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const unit = (key: string, lazy: boolean): PublicUnit => ({
  key, network: 'adsense', slot: '123', sizes: { mobile: [[300, 250]], tablet: [[300, 250]], desktop: [[300, 250]] }, lazy, targeting: [], bids: [], responsive: false,
})
const config: PublicConfig = {
  v: 1, adsense: { client: 'ca-pub-1', auto: false }, gam: null, prebid: null, tam: null,
  privacy: { gdpr: 'never', tcfTimeout: 1000 }, track: false,
  units: { lazyUnit: unit('lazyUnit', true), eagerUnit: unit('eagerUnit', false) },
}
const choices = { necessary: true, analytics: false, marketing: true, functional: false } as never

describe('ads runtime restart', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    document.body.innerHTML = '<div class="engage-ad" data-ad-unit="lazyUnit"></div><div class="engage-ad" data-ad-unit="eagerUnit"></div>'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stop releases slots that never started and removes visibilitychange listeners', () => {
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    const stop = startAds(config, choices, { optInRegion: false })
    const [lazy] = Array.from(document.querySelectorAll('.engage-ad'))
    expect(lazy.getAttribute('data-ad-state')).toBe('pending')
    const visAdds = added.mock.calls.filter((c) => c[0] === 'visibilitychange').length
    expect(visAdds).toBeGreaterThan(0)

    stop()
    expect(lazy.getAttribute('data-ad-state')).toBeNull()
    expect(removed.mock.calls.filter((c) => c[0] === 'visibilitychange').length).toBe(visAdds)
  })

  it('a second start after stop picks the released slot up again', () => {
    startAds(config, choices, { optInRegion: false })()
    const stop2 = startAds(config, choices, { optInRegion: false })
    expect(document.querySelector('[data-ad-unit="lazyUnit"]')?.getAttribute('data-ad-state')).toBe('pending')
    stop2()
  })
})

import { allowUnitWrite, resetUnitWriteWindows } from '@/features/ads/track'

describe('ad-track write cap', () => {
  it('caps writes per unit per minute and resets next minute', () => {
    resetUnitWriteWindows()
    const t = 120_000
    for (let i = 0; i < 3; i++) expect(allowUnitWrite('a', t, 3)).toBe(true)
    expect(allowUnitWrite('a', t + 1000, 3)).toBe(false)
    expect(allowUnitWrite('b', t, 3)).toBe(true)
    expect(allowUnitWrite('a', t + 60_000, 3)).toBe(true)
  })
})
