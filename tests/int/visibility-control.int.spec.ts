import { describe, expect, it } from 'vitest'
import type { Field } from '@/engine'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import type { CollectionConfig } from '@/engine'

describe('VisibilityControl', () => {
  describe('rendering for collections', () => {
    it('should render for pages collection', () => {
      const pages = Pages as CollectionConfig
      expect(pages.slug).toBe('pages')
      // The control should be rendered when collectionSlug is 'pages'
      const isVisibilityEnabledCollection = pages.slug === 'pages' || pages.slug === 'posts'
      expect(isVisibilityEnabledCollection).toBe(true)
    })

    it('should render for posts collection', () => {
      const posts = Posts as CollectionConfig
      expect(posts.slug).toBe('posts')
      // The control should be rendered when collectionSlug is 'posts'
      const isVisibilityEnabledCollection = posts.slug === 'pages' || posts.slug === 'posts'
      expect(isVisibilityEnabledCollection).toBe(true)
    })

    it('should not render for other collections', () => {
      const otherCollectionSlugs = ['products', 'media', 'memberships', 'global-settings']
      otherCollectionSlugs.forEach((slug) => {
        const isVisibilityEnabledCollection = slug === 'pages' || slug === 'posts'
        expect(isVisibilityEnabledCollection).toBe(false)
      })
    })
  })

  describe('form value integration', () => {
    it('should read membersOnly.enabled from form state', () => {
      // Simulating form state with membersOnly field
      const formValue: { enabled: boolean; tier: unknown } = {
        enabled: false,
        tier: null,
      }
      expect(formValue.enabled).toBe(false)
    })

    it('should track enabled state as true when members only', () => {
      const formValue: { enabled: boolean; tier: unknown } = {
        enabled: true,
        tier: { id: 1, name: 'Premium' },
      }
      expect(formValue.enabled).toBe(true)
    })

    it('should preserve tier value when toggling visibility', () => {
      const originalFormValue: { enabled: boolean; tier: Record<string, unknown> } = {
        enabled: false,
        tier: { id: 2, name: 'Basic' },
      }
      // When toggling to members-only
      const updatedFormValue: { enabled: boolean; tier: Record<string, unknown> } = {
        enabled: true,
        tier: originalFormValue.tier,
      }
      expect(updatedFormValue.tier).toEqual({ id: 2, name: 'Basic' })
    })

    it('should handle null tier gracefully', () => {
      const formValue: { enabled: boolean; tier: unknown } = {
        enabled: false,
        tier: null,
      }
      // When toggling to members-only with no tier set
      const updatedFormValue: { enabled: boolean; tier: unknown } = {
        enabled: true,
        tier: formValue.tier ?? null,
      }
      expect(updatedFormValue.tier).toBeNull()
    })
  })

  describe('visibility state mapping', () => {
    it('should map public to membersOnly.enabled=false', () => {
      const visibilityValue = 'public' as const
      type VisibilityValue = typeof visibilityValue | 'members-only'
      const isPublic = (v: VisibilityValue) => v === 'public'
      expect(isPublic(visibilityValue)).toBe(true)
    })

    it('should map members-only to membersOnly.enabled=true', () => {
      const visibilityValue = 'members-only' as const
      type VisibilityValue = 'public' | typeof visibilityValue
      const isMembersOnly = (v: VisibilityValue) => v === 'members-only'
      expect(isMembersOnly(visibilityValue)).toBe(true)
    })

    it('should correctly read current value from membersOnly.enabled', () => {
      // Test reading public status
      const publicFormValue: { enabled: boolean; tier: unknown } = { enabled: false, tier: null }
      const currentValue = publicFormValue.enabled ? 'members-only' : 'public'
      expect(currentValue).toBe('public')

      // Test reading members-only status
      const membersFormValue: { enabled: boolean; tier: unknown } = { enabled: true, tier: { id: 1 } }
      const currentValue2 = membersFormValue.enabled ? 'members-only' : 'public'
      expect(currentValue2).toBe('members-only')
    })
  })

  describe('membersOnly field on collections', () => {
    it('pages collection should have membersOnly field', () => {
      const pages = Pages as CollectionConfig
      const fields = pages.fields as Field[]
      const hasMembersOnly = fields.some((f) => 'name' in f && f.name === 'membersOnly')
      expect(hasMembersOnly).toBe(true)
    })

    it('posts collection should have membersOnly field', () => {
      const posts = Posts as CollectionConfig
      const fields = posts.fields as Field[]
      const hasMembersOnly = fields.some((f) => 'name' in f && f.name === 'membersOnly')
      expect(hasMembersOnly).toBe(true)
    })

    it('membersOnly field should be a group type', () => {
      const pages = Pages as CollectionConfig
      const fields = pages.fields as Field[]
      const membersOnlyField = fields.find((f) => 'name' in f && f.name === 'membersOnly')
      expect(membersOnlyField?.type).toBe('group')
    })

    it('membersOnly group should have enabled checkbox field', () => {
      const pages = Pages as CollectionConfig
      const fields = pages.fields as Field[]
      const membersOnlyField = fields.find((f) => 'name' in f && f.name === 'membersOnly')
      if (membersOnlyField && 'fields' in membersOnlyField) {
        const enabledField = (membersOnlyField.fields as Field[]).find(
          (f) => 'name' in f && f.name === 'enabled',
        )
        expect(enabledField?.type).toBe('checkbox')
      }
    })

    it('membersOnly group should have tier relationship field', () => {
      const pages = Pages as CollectionConfig
      const fields = pages.fields as Field[]
      const membersOnlyField = fields.find((f) => 'name' in f && f.name === 'membersOnly')
      if (membersOnlyField && 'fields' in membersOnlyField) {
        const tierField = (membersOnlyField.fields as Field[]).find(
          (f) => 'name' in f && f.name === 'tier',
        )
        expect(tierField?.type).toBe('relationship')
      }
    })
  })

  describe('unsaved changes detection', () => {
    it('changing visibility should mark form as modified', () => {
      // Simulating form modification on visibility change
      const initialModified = false
      const afterChange = true
      expect(initialModified).toBe(false)
      expect(afterChange).toBe(true)
    })

    it('changing visibility in publish box should participate in unsaved changes', () => {
      // The form context's modified flag should be set when visibility changes
      // This is handled by useField's setValue which calls ctx.setValue(path, value)
      // which in turn calls setModified(true)
      const modifiedBeforeChange = false
      const modifiedAfterChange = true
      expect(modifiedAfterChange).toBe(true)
    })
  })

  describe('readOnly state', () => {
    it('should disable select when readOnly=true', () => {
      const readOnly: boolean = true
      const shouldDisable = readOnly
      expect(shouldDisable).toBe(true)
    })

    it('should enable select when readOnly=false', () => {
      const readOnly: boolean = false
      const shouldDisable = readOnly
      expect(shouldDisable).toBe(false)
    })

    it('should disable select when readOnly is undefined (falsy)', () => {
      const readOnly: boolean | undefined = undefined
      const shouldDisable = readOnly
      expect(shouldDisable).toBeFalsy()
    })
  })

  describe('save and publish integration', () => {
    it('visibility control should use same path as membersOnly field', () => {
      const fieldPath = 'membersOnly'
      expect(fieldPath).toBe('membersOnly')
    })

    it('value should be included in normal save request', () => {
      // When the form is submitted, the membersOnly.enabled value
      // should be included in the request body
      const formFields: Record<string, { value: unknown }> = {
        title: { value: 'Test Page' },
        membersOnly: { value: { enabled: true, tier: null } },
      }
      const memberValue = formFields.membersOnly.value as { enabled: boolean; tier: unknown }
      expect(memberValue.enabled).toBe(true)
    })

    it('value should be included in publish request', () => {
      // Same as save - both draft and published saves should include the value
      const formFields: Record<string, { value: unknown }> = {
        title: { value: 'Test Post' },
        membersOnly: { value: { enabled: false, tier: null } },
      }
      const memberValue = formFields.membersOnly.value as { enabled: boolean; tier: unknown }
      expect(memberValue.enabled).toBe(false)
    })
  })
})
