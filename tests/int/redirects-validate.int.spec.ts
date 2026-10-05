import { describe, expect, it } from 'vitest'
import {
  normalizePath,
  validateRedirect,
  type ValidateInput,
  type ExistingRedirect,
} from '@/features/redirects'

describe('normalizePath', () => {
  it('adds leading slash if missing', () => {
    expect(normalizePath('page')).toBe('/page')
  })

  it('preserves leading slash', () => {
    expect(normalizePath('/page')).toBe('/page')
  })

  it('removes trailing slash except for root', () => {
    expect(normalizePath('/page/')).toBe('/page')
    expect(normalizePath('/about/')).toBe('/about')
  })

  it('keeps root slash', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('//')).toBe('/')
  })

  it('strips fragments', () => {
    expect(normalizePath('/page#section')).toBe('/page')
    expect(normalizePath('/page/#section')).toBe('/page')
  })

  it('strips query strings', () => {
    expect(normalizePath('/page?id=1')).toBe('/page')
    expect(normalizePath('/page/?id=1')).toBe('/page')
  })

  it('strips both fragment and query', () => {
    expect(normalizePath('/page?id=1#top')).toBe('/page')
  })

  it('trims whitespace', () => {
    expect(normalizePath('  /page  ')).toBe('/page')
    expect(normalizePath('\t/page\n')).toBe('/page')
  })

  it('handles complex paths', () => {
    expect(normalizePath('/blog/post-123/')).toBe('/blog/post-123')
    expect(normalizePath('/api/v1/users/')).toBe('/api/v1/users')
  })
})

describe('validateRedirect', () => {
  describe('basic validation', () => {
    it('accepts a valid redirect', () => {
      const input: ValidateInput = {
        fromPath: '/old-page',
        toPath: '/new-page',
        redirectType: '301',
      }

      expect(validateRedirect(input)).toEqual([])
    })

    it('rejects fromPath without leading slash', () => {
      const input: ValidateInput = {
        fromPath: 'old-page',
        toPath: '/new-page',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain('fromPath must start with "/"')
    })

    it('rejects toPath without proper prefix', () => {
      const input: ValidateInput = {
        fromPath: '/old',
        toPath: 'invalid.com',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain('toPath must start with "/" or "http://" or "https://"')
    })

    it('accepts HTTP URLs as toPath', () => {
      const input: ValidateInput = {
        fromPath: '/old',
        toPath: 'http://example.com/new',
        redirectType: '301',
      }

      expect(validateRedirect(input)).toEqual([])
    })

    it('accepts HTTPS URLs as toPath', () => {
      const input: ValidateInput = {
        fromPath: '/old',
        toPath: 'https://example.com/new',
        redirectType: '301',
      }

      expect(validateRedirect(input)).toEqual([])
    })

    it('rejects invalid redirectType', () => {
      const input: ValidateInput = {
        fromPath: '/old',
        toPath: '/new',
        redirectType: '200',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain('redirectType must be one of: 301, 302, 307, 308')
    })

    it('accepts all valid redirectTypes', () => {
      const types = ['301', '302', '307', '308']

      for (const type of types) {
        const input: ValidateInput = {
          fromPath: '/old',
          toPath: '/new',
          redirectType: type,
        }

        expect(validateRedirect(input)).toEqual([])
      }
    })
  })

  describe('reserved paths', () => {
    it('rejects /admin as fromPath', () => {
      const input: ValidateInput = {
        fromPath: '/admin',
        toPath: '/new',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain(
        'fromPath cannot be "/admin", start with "/admin/", "/api/" or "/_next/"',
      )
    })

    it('rejects /admin/ prefix', () => {
      const input: ValidateInput = {
        fromPath: '/admin/users',
        toPath: '/new',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain(
        'fromPath cannot be "/admin", start with "/admin/", "/api/" or "/_next/"',
      )
    })

    it('rejects /api/ prefix', () => {
      const input: ValidateInput = {
        fromPath: '/api/test',
        toPath: '/new',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain(
        'fromPath cannot be "/admin", start with "/admin/", "/api/" or "/_next/"',
      )
    })

    it('rejects /_next/ prefix', () => {
      const input: ValidateInput = {
        fromPath: '/_next/static',
        toPath: '/new',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain(
        'fromPath cannot be "/admin", start with "/admin/", "/api/" or "/_next/"',
      )
    })

    it('allows other paths', () => {
      const input: ValidateInput = {
        fromPath: '/blog/old-post',
        toPath: '/new',
        redirectType: '301',
      }

      expect(validateRedirect(input)).toEqual([])
    })
  })

  describe('loop detection', () => {
    it('rejects when fromPath equals toPath', () => {
      const input: ValidateInput = {
        fromPath: '/page',
        toPath: '/page',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain('fromPath and toPath cannot be the same')
    })

    it('rejects when normalized paths are equal', () => {
      const input: ValidateInput = {
        fromPath: '/page/',
        toPath: '/page',
        redirectType: '301',
      }

      const errors = validateRedirect(input)
      expect(errors).toContain('fromPath and toPath cannot be the same')
    })

    it('ignores loop detection for external URLs', () => {
      const input: ValidateInput = {
        fromPath: '/page',
        toPath: 'https://external.com/page',
        redirectType: '301',
      }

      expect(validateRedirect(input)).toEqual([])
    })

    it('detects direct loop in chain', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/a', toPath: '/b', enabled: true },
        { id: 2, fromPath: '/b', toPath: '/a', enabled: true },
      ]

      const input: ValidateInput = {
        fromPath: '/c',
        toPath: '/a',
        redirectType: '301',
      }

      const errors = validateRedirect(input, existing)
      expect(errors).toContain('Redirect chain would create a loop')
    })

    it('ignores disabled redirects in chain', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/a', toPath: '/b', enabled: false },
        { id: 2, fromPath: '/b', toPath: '/a', enabled: false },
      ]

      const input: ValidateInput = {
        fromPath: '/c',
        toPath: '/a',
        redirectType: '301',
      }

      expect(validateRedirect(input, existing)).toEqual([])
    })
  })

  describe('chain length', () => {
    it('allows chains up to 5 hops', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/a', toPath: '/b', enabled: true },
        { id: 2, fromPath: '/b', toPath: '/c', enabled: true },
        { id: 3, fromPath: '/c', toPath: '/d', enabled: true },
        { id: 4, fromPath: '/d', toPath: '/e', enabled: true },
      ]

      const input: ValidateInput = {
        fromPath: '/start',
        toPath: '/a',
        redirectType: '301',
      }

      // This creates a chain: /start -> /a -> /b -> /c -> /d -> /e (5 hops)
      expect(validateRedirect(input, existing)).toEqual([])
    })

    it('rejects chains longer than 5 hops', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/a', toPath: '/b', enabled: true },
        { id: 2, fromPath: '/b', toPath: '/c', enabled: true },
        { id: 3, fromPath: '/c', toPath: '/d', enabled: true },
        { id: 4, fromPath: '/d', toPath: '/e', enabled: true },
        { id: 5, fromPath: '/e', toPath: '/f', enabled: true },
      ]

      const input: ValidateInput = {
        fromPath: '/start',
        toPath: '/a',
        redirectType: '301',
      }

      // This creates a chain: /start -> /a -> /b -> /c -> /d -> /e -> /f (6 hops)
      const errors = validateRedirect(input, existing)
      expect(errors).toContain('Redirect chain exceeds maximum length of 5 hops')
    })
  })

  describe('duplicate detection', () => {
    it('rejects duplicate fromPath', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/old', toPath: '/new', enabled: true },
      ]

      const input: ValidateInput = {
        fromPath: '/old',
        toPath: '/another',
        redirectType: '301',
      }

      const errors = validateRedirect(input, existing)
      expect(errors).toContain('fromPath "/old" is already in use')
    })

    it('excludes selfId from duplicate check', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/old', toPath: '/new', enabled: true },
      ]

      const input: ValidateInput = {
        fromPath: '/old',
        toPath: '/another',
        redirectType: '301',
      }

      const errors = validateRedirect(input, existing, 1)
      expect(errors).not.toContain('fromPath "/old" is already in use')
    })

    it('detects duplicates after normalization', () => {
      const existing: ExistingRedirect[] = [
        { id: 1, fromPath: '/old/', toPath: '/new', enabled: true },
      ]

      const input: ValidateInput = {
        fromPath: '/old',
        toPath: '/another',
        redirectType: '301',
      }

      const errors = validateRedirect(input, existing)
      expect(errors).toContain('fromPath "/old" is already in use')
    })
  })

  describe('multiple errors', () => {
    it('returns all errors at once', () => {
      const input: ValidateInput = {
        fromPath: '/admin/page',
        toPath: 'invalid',
        redirectType: '200',
      }

      const errors = validateRedirect(input)
      expect(errors.length).toBeGreaterThan(1)
      expect(errors).toContain(
        'fromPath cannot be "/admin", start with "/admin/", "/api/" or "/_next/"',
      )
      expect(errors).toContain('toPath must start with "/" or "http://" or "https://"')
      expect(errors).toContain('redirectType must be one of: 301, 302, 307, 308')
    })
  })
})

describe('validateRedirect review fixes', () => {
  const ex = (id: number, from: string, to: string, enabled = true): ExistingRedirect => ({ id, fromPath: from, toPath: to, enabled })

  it('rejects protocol-relative targets (open redirect)', () => {
    expect(validateRedirect({ fromPath: '/a', toPath: '//attacker.com', redirectType: '301' }, [])).toEqual(
      expect.arrayContaining([expect.stringContaining('not "//host"')]),
    )
    expect(validateRedirect({ fromPath: '/a', toPath: '/\\attacker.com', redirectType: '301' }, [])).toEqual(
      expect.arrayContaining([expect.stringContaining('not "//host"')]),
    )
  })

  it('counts hops leading INTO the new redirect when checking chain length', () => {
    const existing = [ex(1, '/h1', '/h2'), ex(2, '/h2', '/h3'), ex(3, '/h3', '/h4'), ex(4, '/h4', '/h5'), ex(5, '/h5', '/h6')]
    const errors = validateRedirect({ fromPath: '/h6', toPath: '/h7', redirectType: '301' }, existing)
    expect(errors).toContain('Redirect chain exceeds maximum length of 5 hops')
  })

  it('allows a chain that totals exactly 5 hops', () => {
    const existing = [ex(1, '/h1', '/h2'), ex(2, '/h2', '/h3'), ex(3, '/h3', '/h4'), ex(4, '/h4', '/h5')]
    expect(validateRedirect({ fromPath: '/h5', toPath: '/h6', redirectType: '301' }, existing)).toEqual([])
  })

  it('ignores the old row of the record being edited', () => {
    const existing = [ex(1, '/a', '/b'), ex(2, '/b', '/c')]
    // Editing record 1 to point elsewhere must not still see /a -> /b -> /c
    expect(validateRedirect({ fromPath: '/a', toPath: '/z', redirectType: '301' }, existing, 1)).toEqual([])
  })
})
