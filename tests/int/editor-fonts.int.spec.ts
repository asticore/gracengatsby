import { beforeEach, describe, expect, it, vi } from 'vitest'

import { blockFontStack } from '@/lib/blockStyle'
import { loadSiteFonts, parseSiteFonts, resetSiteFontsCache } from '@/views/visualEditor/useSiteFonts'

describe('installed fonts in blockFontStack', () => {
  it('quotes a safe installed family', () => {
    expect(blockFontStack('family:Lora')).toBe('"Lora", system-ui, sans-serif')
  })
  it('rejects unsafe families', () => {
    expect(blockFontStack('family:x";}body{')).toBeNull()
    expect(blockFontStack('family:')).toBeNull()
    expect(blockFontStack('Lora')).toBeNull()
  })
})

describe('useSiteFonts loader', () => {
  beforeEach(() => resetSiteFontsCache())
  it('parses and caches', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ fonts: [{ family: 'Lora' }, { nope: 1 }] })))
    expect(await loadSiteFonts(f as unknown as typeof fetch)).toEqual([{ family: 'Lora' }])
    await loadSiteFonts(f as unknown as typeof fetch)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('returns [] on failure', async () => {
    expect(await loadSiteFonts((async () => { throw new Error('x') }) as unknown as typeof fetch)).toEqual([])
    expect(parseSiteFonts(null)).toEqual([])
  })
})
