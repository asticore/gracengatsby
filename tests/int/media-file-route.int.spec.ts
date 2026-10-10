// @vitest-environment node
// The public media file route: only flat, non-original names are ever served.
// The guard runs before any R2 access, so no bucket is needed here.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn(async () => ({ env: {} })) }))

import { getMediaObjectResponse, isServableMediaFilename, ORIGINAL_PREFIX } from '@/localapi/storage'

describe('isServableMediaFilename', () => {
  it('serves ordinary flat filenames', () => {
    expect(isServableMediaFilename('harbour.jpg')).toBe(true)
    expect(isServableMediaFilename('Photo One (2).png')).toBe(true)
  })

  it('refuses path separators and parent references', () => {
    expect(isServableMediaFilename('original/harbour.jpg')).toBe(false)
    expect(isServableMediaFilename('a/b.jpg')).toBe(false)
    expect(isServableMediaFilename('a\\b.jpg')).toBe(false)
    expect(isServableMediaFilename('..harbour.jpg')).toBe(false)
    expect(isServableMediaFilename('x..y.jpg')).toBe(false)
  })

  it('refuses any name starting with original, in any case', () => {
    expect(isServableMediaFilename('original-harbour.jpg')).toBe(false)
    expect(isServableMediaFilename('Original.jpg')).toBe(false)
    expect(isServableMediaFilename(`${ORIGINAL_PREFIX}harbour.jpg`)).toBe(false)
  })

  it('refuses an empty name or one containing a NUL byte', () => {
    expect(isServableMediaFilename('')).toBe(false)
    expect(isServableMediaFilename('a\0b.jpg')).toBe(false)
  })
})

describe('getMediaObjectResponse', () => {
  it('answers null (a 404 at the route) for a kept original, without touching storage', async () => {
    const request = new Request('http://localhost/api/media/file/original%2Fharbour.jpg')
    await expect(getMediaObjectResponse('original/harbour.jpg', request)).resolves.toBeNull()
    await expect(getMediaObjectResponse('original-harbour.jpg', request)).resolves.toBeNull()
  })
})
