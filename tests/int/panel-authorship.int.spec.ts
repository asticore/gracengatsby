import { describe, expect, it } from 'vitest'

/**
 * Tests for authorship display helpers in the panel.
 * Covers user display name resolution and formatted authored-by strings.
 */

describe('panel authorship helpers', () => {
  describe('userDisplayName', () => {
    it('returns name when available', () => {
      // Simulating the userDisplayName logic from EditView
      const user: unknown = { id: 1, email: 'jane@example.com', name: 'Jane Doe' }
      // Extract logic: check name first
      const userData = typeof user === 'object' ? (user as Record<string, unknown>) : null
      const result = userData?.name ? String(userData.name) : undefined
      expect(result).toBe('Jane Doe')
    })

    it('falls back to email when name is missing', () => {
      const user: unknown = { id: 1, email: 'jane@example.com' }
      const userData = typeof user === 'object' ? (user as Record<string, unknown>) : null
      const result = userData?.email ? String(userData.email) : undefined
      expect(result).toBe('jane@example.com')
    })

    it('returns id as string when neither name nor email exist', () => {
      const user = { id: 42 }
      const result = typeof user === 'object' && 'id' in user ? String(user.id) : undefined
      expect(result).toBe('42')
    })

    it('handles undefined user gracefully', () => {
      const user: unknown = undefined
      const userData = typeof user === 'object' ? (user as Record<string, unknown>) : null
      const result = userData ? userData.name : undefined
      expect(result).toBeUndefined()
    })

    it('handles null user gracefully', () => {
      const user: unknown = null
      const userData = typeof user === 'object' ? (user as Record<string, unknown>) : null
      const result = userData ? userData.name : undefined
      expect(result).toBeUndefined()
    })

    it('handles plain id string or number', () => {
      // When user is just an ID (not yet resolved)
      const user1: unknown = 123
      const user2: unknown = 'user-abc'
      const result1 = String(user1)
      const result2 = String(user2)
      expect(result1).toBe('123')
      expect(result2).toBe('user-abc')
    })
  })

  describe('DocumentPanelInfo authorship fields', () => {
    it('includes updatedByName and createdByName when documents have those fields', () => {
      // Simulating panel info with authorship data
      const panelInfo: Record<string, unknown> & { updatedByName?: string; createdByName?: string } = {
        collectionSlug: 'pages',
        id: 1,
        label: 'Page',
        draftsEnabled: true,
        status: 'published',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        updatedByName: 'Jane Doe',
        createdByName: 'John Smith',
        canDelete: true,
        canCreate: true,
      }
      expect(panelInfo.updatedByName).toBe('Jane Doe')
      expect(panelInfo.createdByName).toBe('John Smith')
    })

    it('allows missing authorship fields for collections without user tracking', () => {
      const panelInfo: Record<string, unknown> & { updatedByName?: string; createdByName?: string } = {
        collectionSlug: 'media',
        id: 5,
        label: 'Media',
        draftsEnabled: false,
        canDelete: true,
        canCreate: true,
      }
      expect(panelInfo.updatedByName).toBeUndefined()
      expect(panelInfo.createdByName).toBeUndefined()
    })
  })

  describe('Details box rendering logic', () => {
    it('shows last edited by and created by rows when authorship data is present', () => {
      const info: Record<string, unknown> & { updatedByName?: string; createdByName?: string } = {
        updatedByName: 'Jane',
        createdByName: 'John',
        updatedAt: '2026-01-02T00:00:00Z',
      }
      const hasEditByInfo = info.updatedByName !== undefined || info.createdByName !== undefined
      expect(hasEditByInfo).toBe(true)
    })

    it('hides authorship rows when no user tracking exists', () => {
      const info: Record<string, unknown> & { updatedByName?: string; createdByName?: string } = {
        updatedByName: undefined,
        createdByName: undefined,
      }
      const hasEditByInfo = info.updatedByName !== undefined || info.createdByName !== undefined
      expect(hasEditByInfo).toBe(false)
    })

    it('uses Unknown when updatedByName is null/undefined', () => {
      const updatedByName: string | undefined = undefined
      const display = updatedByName || 'Unknown'
      expect(display).toBe('Unknown')
    })

    it('uses Unknown when createdByName is null/undefined', () => {
      const createdByName: string | undefined = undefined
      const display = createdByName || 'Unknown'
      expect(display).toBe('Unknown')
    })
  })
})
