import { describe, expect, it } from 'vitest'

import { normaliseAudioUrl, normalisePageAudio, shouldSkipForReducedData, validateAudioUrl } from '@/features/pageAudio/config'

describe('page audio URL rules', () => {
  it('accepts https and same-origin audio files', () => {
    expect(normaliseAudioUrl('https://cdn.example.com/a/song.mp3')).toBe('https://cdn.example.com/a/song.mp3')
    expect(normaliseAudioUrl('https://x.test/loop.OGG?v=2')).toBe('https://x.test/loop.OGG?v=2')
    expect(normaliseAudioUrl('/media/song.mp3')).toBe('/media/song.mp3')
  })
  it('rejects unsafe or unsupported links', () => {
    for (const bad of ['http://x.test/a.mp3', 'javascript:alert(1).mp3', '//evil.test/a.mp3', 'https://x.test/page', 'https://open.spotify.com/track/1', 'https://u:p@x.test/a.mp3', 'not a url', '', null, 5]) {
      expect(normaliseAudioUrl(bad)).toBeNull()
    }
  })
  it('validate allows empty and explains bad values', () => {
    expect(validateAudioUrl('')).toBe(true)
    expect(validateAudioUrl(undefined)).toBe(true)
    expect(typeof validateAudioUrl('http://x.test/a.mp3')).toBe('string')
  })
})

describe('normalisePageAudio', () => {
  it('returns null when disabled or without a usable source', () => {
    expect(normalisePageAudio(null)).toBeNull()
    expect(normalisePageAudio({ enabled: false, sourceType: 'url', url: 'https://x.test/a.mp3' })).toBeNull()
    expect(normalisePageAudio({ enabled: true, sourceType: 'url', url: 'ftp://x.test/a.mp3' })).toBeNull()
    expect(normalisePageAudio({ enabled: true, sourceType: 'upload' }, null)).toBeNull()
  })
  it('uses safe defaults and clamps volume', () => {
    const cfg = normalisePageAudio({ enabled: true, sourceType: 'url', url: 'https://x.test/a.mp3', volume: 250 })
    expect(cfg).toMatchObject({ loop: true, volume: 1, startMuted: true, showControls: true, startOnFirstInteraction: true, respectReducedData: true })
    expect(normalisePageAudio({ enabled: true, sourceType: 'url', url: 'https://x.test/a.mp3', volume: -5 })?.volume).toBe(0)
    expect(normalisePageAudio({ enabled: true, sourceType: 'url', url: 'https://x.test/a.mp3', volume: 'abc' })?.volume).toBe(0.8)
  })
  it('uses the resolved upload url and honours explicit false flags', () => {
    const cfg = normalisePageAudio({ enabled: true, sourceType: 'upload', loop: false, startMuted: false, showControls: false }, '/api/media/file/x.mp3')
    expect(cfg).toMatchObject({ src: '/api/media/file/x.mp3', loop: false, startMuted: false, showControls: false })
  })
})

describe('reduced data', () => {
  it('skips on save-data and slow connections only', () => {
    expect(shouldSkipForReducedData({ saveData: true })).toBe(true)
    expect(shouldSkipForReducedData({ effectiveType: '2g' })).toBe(true)
    expect(shouldSkipForReducedData({ effectiveType: '4g' })).toBe(false)
    expect(shouldSkipForReducedData(undefined)).toBe(false)
  })
})
