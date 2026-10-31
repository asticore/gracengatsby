// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { adminFieldLabel, loadStrings } from '@/features/uiStrings'

describe('adminFieldLabel: per-group labels for shared field names', () => {
  it('gives Meta and TikTok their own labels for the same field name', async () => {
    const dict = await loadStrings('de')
    const ctx = { locale: 'de', dict }
    expect(adminFieldLabel('metaPixel.enabled', 'enabled', 'Send events to Meta', ctx)).toBe('Ereignisse an Meta senden')
    expect(adminFieldLabel('tiktokPixel.enabled', 'enabled', 'Send events to TikTok', ctx)).toBe('Ereignisse an TikTok senden')
    expect(adminFieldLabel('metaPixel.pixelId', 'pixelId', 'Meta pixel ID', ctx)).toBe('Meta-Pixel-ID')
    expect(adminFieldLabel('tiktokPixel.pixelId', 'pixelId', 'TikTok pixel ID', ctx)).toBe('TikTok-Pixel-ID')
  })

  it('reads the scoped label in every supported language, not the bare name', async () => {
    for (const locale of ['fr', 'ja', 'zh-Hans', 'ar']) {
      const dict = await loadStrings(locale)
      const meta = adminFieldLabel('metaPixel.consentCategory', 'consentCategory', 'Consent category', { locale, dict })
      const tiktok = adminFieldLabel('tiktokPixel.consentCategory', 'consentCategory', 'Consent category', { locale, dict })
      expect(meta).not.toBe('Consent category')
      expect(tiktok).toBe(meta)
    }
  })

  it('uses the bare field name when the path is not a scoped key', async () => {
    const dict = await loadStrings('de')
    expect(adminFieldLabel('title', 'title', 'Headline', { locale: 'de', dict })).toBe('Titel')
    expect(adminFieldLabel('items.0.title', 'title', 'Headline', { locale: 'de', dict })).toBe('Titel')
  })

  it('returns the config label for English, with or without a path', async () => {
    const dict = await loadStrings('en')
    expect(adminFieldLabel('metaPixel.enabled', 'enabled', 'Send events to Meta', { locale: 'en', dict })).toBe('Send events to Meta')
    expect(adminFieldLabel('metaPixel.enabled', 'enabled', 'Send events to Meta')).toBe('Send events to Meta')
  })
})

describe('admin aria labels in the reference table', () => {
  it('translates the aria strings in every language', async () => {
    for (const locale of ['de', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pt', 'ru', 'zh-Hans', 'ar', 'hi']) {
      const dict = await loadStrings(locale)
      expect(dict['aria.trash'], locale).toBeTruthy()
      expect(dict['aria.conditionsJson'], locale).toBeTruthy()
      expect(dict['aria.fonts.search'], locale).not.toBe('')
    }
  })
})
