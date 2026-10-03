import { describe, expect, it } from 'vitest'
import { diffVersion, type DiffEntry } from '@/admin/views/versionDiff'

describe('diffVersion function', () => {
  describe('ignored keys', () => {
    it('ignores default keys: id, createdAt, updatedAt, _status, createdBy, updatedBy', () => {
      const version = {
        title: 'A',
        id: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
        _status: 'draft',
        createdBy: 10,
        updatedBy: 20,
      }
      const current = {
        title: 'A',
        id: 999,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-02T00:00:00Z',
        _status: 'published',
        createdBy: 5,
        updatedBy: 15,
      }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(0)
    })

    it('respects custom ignore list', () => {
      const version = { title: 'A', internal: 'secret1' }
      const current = { title: 'A', internal: 'secret2' }

      const diffs = diffVersion(version, current, { ignore: ['internal'] })
      expect(diffs).toHaveLength(0)
    })
  })

  describe('changed/added/removed detection', () => {
    it('detects changed fields', () => {
      const version = { title: 'Old', content: 'Changed' }
      const current = { title: 'New', content: 'Different' }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(2)
      expect(diffs.find((d) => d.field === 'title')?.kind).toBe('changed')
      expect(diffs.find((d) => d.field === 'content')?.kind).toBe('changed')
    })

    it('detects added fields', () => {
      const version = { title: 'T' }
      const current = { title: 'T', newField: 'added' }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].kind).toBe('added')
      expect(diffs[0].field).toBe('newField')
    })

    it('detects removed fields', () => {
      const version = { title: 'T', oldField: 'removed' }
      const current = { title: 'T' }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].kind).toBe('removed')
      expect(diffs[0].field).toBe('oldField')
    })
  })

  describe('value formatting', () => {
    it('formats strings, truncating at 300 chars', () => {
      const longStr = 'a'.repeat(350)
      const version = { description: longStr }
      const current = { description: '' }

      const diffs = diffVersion(version, current)
      expect(diffs[0].before).toBe('a'.repeat(300) + '...')
    })

    it('formats booleans as Yes/No', () => {
      const version = { active: true, archived: false }
      const current = { active: false, archived: true }

      const diffs = diffVersion(version, current)
      const activeDiff = diffs.find((d) => d.field === 'active')
      const archivedDiff = diffs.find((d) => d.field === 'archived')
      expect(activeDiff?.before).toBe('Yes')
      expect(activeDiff?.after).toBe('No')
      expect(archivedDiff?.before).toBe('No')
      expect(archivedDiff?.after).toBe('Yes')
    })

    it('formats null/undefined as (empty)', () => {
      const version: Record<string, unknown> = { field: 'value' }
      const current: Record<string, unknown> = { field: null }

      const diffs = diffVersion(version, current)
      expect(diffs[0].after).toBe('(empty)')
    })

    it('formats arrays of primitives as comma-separated, truncated', () => {
      const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`)
      const version = { tags: tags as unknown[] }
      const current = { tags: [] as unknown[] }

      const diffs = diffVersion(version, current)
      expect(diffs[0].before).toContain(',')
      expect(diffs[0].before.length).toBeLessThanOrEqual(303) // 300 + '...'
    })

    it('formats objects with identifying fields (id, title, name, etc)', () => {
      const version: Record<string, unknown> = { author: { id: 123, name: 'Alice', email: 'alice@example.com' } }
      const current: Record<string, unknown> = { author: { id: 456, name: 'Bob', email: 'bob@example.com' } }

      const diffs = diffVersion(version, current)
      expect(diffs[0].before).toBe('123') // Should use id
      expect(diffs[0].after).toBe('456')
    })

    it('prefers id over title over name', () => {
      const version: Record<string, unknown> = { obj: { id: 1, title: 'Title', name: 'Name' } }
      const current: Record<string, unknown> = { obj: { id: 2, title: 'Title', name: 'Name' } }

      const diffs = diffVersion(version, current)
      expect(diffs[0].before).toBe('1')
      expect(diffs[0].after).toBe('2')
    })
  })

  describe('blocks array handling', () => {
    it('renders blocks-style arrays with blockType names', () => {
      const version = {
        blocks: [
          { blockType: 'Hero', title: 'Hero Title' },
          { blockType: 'Text', content: 'Some text' },
          { blockType: 'Gallery', images: [] as unknown[] },
        ] as unknown[],
      }
      const current = {
        blocks: [
          { blockType: 'Hero', title: 'Different Hero' },
          { blockType: 'Text', content: 'Different text' },
        ] as unknown[],
      }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].before).toBe('Hero, Text, Gallery')
      expect(diffs[0].after).toBe('Hero, Text')
    })
  })

  describe('equal values', () => {
    it('returns empty array when versions are identical', () => {
      const doc = { title: 'Same', content: 'Same', published: true }
      const diffs = diffVersion(doc, doc)
      expect(diffs).toHaveLength(0)
    })

    it('compares with deep equality (ignores key order)', () => {
      const version = { a: 1, b: 2, c: 3 }
      const current = { c: 3, b: 2, a: 1 }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(0)
    })

    it('considers nested objects with same values as equal', () => {
      const version = { meta: { author: 'Alice', date: '2026-10-01' } }
      const current = { meta: { author: 'Alice', date: '2026-10-01' } }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(0)
    })
  })

  describe('custom labels', () => {
    it('uses custom labels from opts.labels', () => {
      const version = { firstName: 'John' }
      const current = { firstName: 'Jane' }

      const diffs = diffVersion(version, current, { labels: { firstName: 'Given name' } })
      expect(diffs[0].label).toBe('Given name')
    })

    it('falls back to humanized field name if no custom label', () => {
      const version = { firstName: 'John' }
      const current = { firstName: 'Jane' }

      const diffs = diffVersion(version, current)
      expect(diffs[0].label).toBe('First Name')
    })
  })

  describe('edge cases', () => {
    it('handles empty objects', () => {
      const diffs = diffVersion({}, {})
      expect(diffs).toHaveLength(0)
    })

    it('handles arrays containing mixed primitives and objects', () => {
      const version = { items: [1, 'string', { id: 10 }] as unknown[] }
      const current = { items: [1, 'string', { id: 20 }] as unknown[] }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].before).toContain('1')
      expect(diffs[0].before).toContain('string')
      expect(diffs[0].before).toContain('10')
    })

    it('handles deeply nested structures', () => {
      const version = { deep: { nested: { value: 'old' } } }
      const current = { deep: { nested: { value: 'new' } } }

      const diffs = diffVersion(version, current)
      expect(diffs).toHaveLength(1)
      expect(diffs[0].field).toBe('deep')
    })

    it('handles numbers correctly', () => {
      const version = { count: 42 }
      const current = { count: 100 }

      const diffs = diffVersion(version, current)
      expect(diffs[0].before).toBe('42')
      expect(diffs[0].after).toBe('100')
    })
  })
})
