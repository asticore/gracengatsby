import { describe, expect, it } from 'vitest'
import {
  isSmallImage,
  pickImageSource,
  getNoticeText,
  type ImageSource,
} from '@/admin/views/SocialImageInfo'

describe('isSmallImage', () => {
  it('returns false when both width and height are undefined', () => {
    expect(isSmallImage(undefined, undefined)).toBe(false)
  })

  it('returns false when only width is undefined', () => {
    expect(isSmallImage(undefined, 630)).toBe(false)
  })

  it('returns false when only height is undefined', () => {
    expect(isSmallImage(1200, undefined)).toBe(false)
  })

  it('returns false when image is exactly 1200x630', () => {
    expect(isSmallImage(1200, 630)).toBe(false)
  })

  it('returns true when width is exactly 1199', () => {
    expect(isSmallImage(1199, 630)).toBe(true)
  })

  it('returns true when height is exactly 629', () => {
    expect(isSmallImage(1200, 629)).toBe(true)
  })

  it('returns true when both dimensions are below threshold', () => {
    expect(isSmallImage(800, 400)).toBe(true)
  })

  it('returns false when width >= 1200 and height >= 630', () => {
    expect(isSmallImage(1920, 1080)).toBe(false)
  })

  it('returns true when width is above but height is below', () => {
    expect(isSmallImage(1200, 629)).toBe(true)
  })

  it('returns true when height is above but width is below', () => {
    expect(isSmallImage(1199, 630)).toBe(true)
  })
})

describe('pickImageSource', () => {
  describe('for social image (Facebook/LinkedIn/Slack)', () => {
    it('returns socialImage when ogImage is set', () => {
      const result = pickImageSource({ id: 1 }, undefined, undefined, false)
      expect(result).toBe('socialImage')
    })

    it('returns featuredImage when only featuredImage is set', () => {
      const result = pickImageSource(undefined, undefined, { id: 2 }, false)
      expect(result).toBe('featuredImage')
    })

    it('returns siteDefault when nothing is set', () => {
      const result = pickImageSource(undefined, undefined, undefined, false)
      expect(result).toBe('siteDefault')
    })

    it('prefers ogImage over featuredImage', () => {
      const result = pickImageSource({ id: 1 }, undefined, { id: 2 }, false)
      expect(result).toBe('socialImage')
    })
  })

  describe('for X image', () => {
    it('returns socialImage when xImage is set', () => {
      const result = pickImageSource(undefined, { id: 3 }, undefined, true)
      expect(result).toBe('socialImage')
    })

    it('returns socialImage when xImage is not set but ogImage is', () => {
      const result = pickImageSource({ id: 1 }, undefined, undefined, true)
      expect(result).toBe('socialImage')
    })

    it('returns featuredImage when xImage and ogImage are not set but featuredImage is', () => {
      const result = pickImageSource(undefined, undefined, { id: 2 }, true)
      expect(result).toBe('featuredImage')
    })

    it('returns siteDefault when nothing is set', () => {
      const result = pickImageSource(undefined, undefined, undefined, true)
      expect(result).toBe('siteDefault')
    })

    it('prefers xImage over ogImage', () => {
      const result = pickImageSource({ id: 1 }, { id: 3 }, undefined, true)
      expect(result).toBe('socialImage')
    })

    it('falls back to ogImage when xImage not set', () => {
      const result = pickImageSource({ id: 1 }, undefined, undefined, true)
      expect(result).toBe('socialImage')
    })

    it('falls back to featuredImage when xImage and ogImage not set', () => {
      const result = pickImageSource(undefined, undefined, { id: 2 }, true)
      expect(result).toBe('featuredImage')
    })

    it('uses siteDefault when all images missing', () => {
      const result = pickImageSource(undefined, undefined, undefined, true)
      expect(result).toBe('siteDefault')
    })
  })

  describe('edge cases', () => {
    it('handles numeric IDs as truthy values', () => {
      const result = pickImageSource(1, undefined, undefined, false)
      expect(result).toBe('socialImage')
    })

    it('handles string IDs as truthy values', () => {
      const result = pickImageSource('img-123', undefined, undefined, false)
      expect(result).toBe('socialImage')
    })

    it('treats 0 as falsy', () => {
      const result = pickImageSource(0, undefined, { id: 2 }, false)
      expect(result).toBe('featuredImage')
    })

    it('treats empty string as falsy', () => {
      const result = pickImageSource('', undefined, { id: 2 }, false)
      expect(result).toBe('featuredImage')
    })

    it('treats null as falsy', () => {
      const result = pickImageSource(null, undefined, { id: 2 }, false)
      expect(result).toBe('featuredImage')
    })
  })
})

describe('getNoticeText', () => {
  describe('for social image (Facebook/LinkedIn/Slack)', () => {
    it('shows socialImage source', () => {
      const text = getNoticeText('socialImage', false)
      expect(text).toContain('Shared on Facebook, LinkedIn and Slack')
      expect(text).toContain('the social image')
    })

    it('shows featuredImage source', () => {
      const text = getNoticeText('featuredImage', false)
      expect(text).toContain('Shared on Facebook, LinkedIn and Slack')
      expect(text).toContain('the featured image')
    })

    it('shows siteDefault source', () => {
      const text = getNoticeText('siteDefault', false)
      expect(text).toContain('Shared on Facebook, LinkedIn and Slack')
      expect(text).toContain('the site default image')
    })

    it('shows none set when no source', () => {
      const text = getNoticeText(null, false)
      expect(text).toContain('Shared on Facebook, LinkedIn and Slack')
      expect(text).toContain('none set')
    })
  })

  describe('for X image', () => {
    it('shows X prefix', () => {
      const text = getNoticeText('socialImage', true)
      expect(text).toContain('X uses')
    })

    it('shows socialImage source for X', () => {
      const text = getNoticeText('socialImage', true)
      expect(text).toContain('the social image')
    })

    it('shows featuredImage source for X', () => {
      const text = getNoticeText('featuredImage', true)
      expect(text).toContain('the featured image')
    })

    it('shows siteDefault source for X', () => {
      const text = getNoticeText('siteDefault', true)
      expect(text).toContain('the site default image')
    })

    it('shows none set when no source for X', () => {
      const text = getNoticeText(null, true)
      expect(text).toContain('X uses')
      expect(text).toContain('none set')
    })
  })

  describe('exact wording', () => {
    it('has correct wording for social image', () => {
      expect(getNoticeText('socialImage', false)).toBe(
        'Shared on Facebook, LinkedIn and Slack using: the social image'
      )
    })

    it('has correct wording for featured image', () => {
      expect(getNoticeText('featuredImage', false)).toBe(
        'Shared on Facebook, LinkedIn and Slack using: the featured image'
      )
    })

    it('has correct wording for X with social image', () => {
      expect(getNoticeText('socialImage', true)).toBe('X uses: the social image')
    })

    it('has correct wording for X with featured image', () => {
      expect(getNoticeText('featuredImage', true)).toBe('X uses: the featured image')
    })
  })
})
