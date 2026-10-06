import { describe, it, expect } from 'vitest'
import { shouldRedirectOn401, buildLoginRedirect } from '@/admin/sessionWatchLogic'

describe('sessionWatchLogic', () => {
  describe('shouldRedirectOn401', () => {
    const origin = 'https://example.com'

    it('returns true for 401 on same-origin API route (except login endpoints)', () => {
      expect(shouldRedirectOn401('https://example.com/api/collections/posts', 401, origin)).toBe(true)
      expect(shouldRedirectOn401('/api/globals/settings', 401, origin)).toBe(true)
    })

    it('returns false for 401 on /api/users/login', () => {
      expect(shouldRedirectOn401('https://example.com/api/users/login', 401, origin)).toBe(false)
    })

    it('returns false for 401 on /api/users/logout', () => {
      expect(shouldRedirectOn401('https://example.com/api/users/logout', 401, origin)).toBe(false)
    })

    it('returns false for 401 on /api/users/me', () => {
      expect(shouldRedirectOn401('https://example.com/api/users/me', 401, origin)).toBe(false)
    })

    it('returns false for 403 (different status code)', () => {
      expect(shouldRedirectOn401('https://example.com/api/collections/posts', 403, origin)).toBe(false)
    })

    it('returns false for 401 on cross-origin URL', () => {
      expect(shouldRedirectOn401('https://other.com/api/collections', 401, origin)).toBe(false)
    })

    it('returns false for 401 on non-API route', () => {
      expect(shouldRedirectOn401('https://example.com/admin/collections', 401, origin)).toBe(false)
      expect(shouldRedirectOn401('https://example.com/foo/bar', 401, origin)).toBe(false)
    })

    it('handles relative URLs with origin', () => {
      expect(shouldRedirectOn401('/api/settings', 401, origin)).toBe(true)
    })

    it('returns false for invalid URLs', () => {
      expect(shouldRedirectOn401('not-a-url', 401, origin)).toBe(false)
    })

    it('returns false for 401 on 200 status', () => {
      expect(shouldRedirectOn401('https://example.com/api/data', 200, origin)).toBe(false)
    })
  })

  describe('buildLoginRedirect', () => {
    it('encodes pathname and search in redirect param', () => {
      const result = buildLoginRedirect('/admin/collections/posts/1', '?tab=versions')
      expect(result).toContain('/admin/login')
      expect(result).toContain('expired=1')
      expect(result).toContain('redirect=')
      // The redirect should be URL encoded
      expect(result).toContain('%2Fadmin%2Fcollections%2Fposts%2F1%3Ftab%3Dversions')
    })

    it('encodes special characters in redirect param', () => {
      const result = buildLoginRedirect('/admin/settings', '?search=hello world&filter=active')
      expect(result).toContain('redirect=')
      // URLSearchParams encodes spaces as + in the query string
      expect(result.includes('hello+world') || result.includes('hello%20world')).toBe(true)
    })

    it('handles pathname without search', () => {
      const result = buildLoginRedirect('/admin/collections', '')
      expect(result).toContain('expired=1')
      expect(result).toContain('redirect=%2Fadmin%2Fcollections')
    })

    it('returns path-relative URL', () => {
      const result = buildLoginRedirect('/admin/foo', '')
      expect(result.startsWith('/admin/login')).toBe(true)
    })

    it('includes both expired and redirect params', () => {
      const result = buildLoginRedirect('/admin/test', '')
      const params = new URLSearchParams(result.split('?')[1])
      expect(params.get('expired')).toBe('1')
      expect(params.has('redirect')).toBe(true)
    })
  })
})