import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readKeys, record } = vi.hoisted(() => ({ readKeys: vi.fn(), record: vi.fn(async () => true) }))
vi.mock('@/features/ads/d1', () => ({ readAdUnitKeysFromD1: readKeys }))
vi.mock('@/features/ads/stats', () => ({ recordAdEvent: record }))

import { POST } from '@/app/(engage)/api/ad-track/route'
import { resetUnitWriteWindows } from '@/features/ads/track'

const req = (unit: string) =>
  new Request('http://x/api/ad-track', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'same-origin', 'user-agent': 'Mozilla/5.0 Chrome', 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify({ u: unit, e: 'v', b: 'd' }),
  })

describe('POST /api/ad-track', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetUnitWriteWindows()
  })
  it('records a known unit using the cached key reader only', async () => {
    readKeys.mockResolvedValue(new Set(['top']))
    expect((await POST(req('top'))).status).toBe(204)
    expect(record).toHaveBeenCalledTimes(1)
  })
  it('ignores unknown units without writing', async () => {
    readKeys.mockResolvedValue(new Set(['top']))
    expect((await POST(req('nope'))).status).toBe(204)
    expect(record).not.toHaveBeenCalled()
  })
})
