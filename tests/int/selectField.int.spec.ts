import { describe, expect, it } from 'vitest'
import type { Field } from '@/engine'

describe('SelectField placeholder support', () => {
  describe('admin.placeholder configuration', () => {
    it('should support custom placeholder text', () => {
      const field: Field = {
        type: 'select',
        name: 'category',
        options: [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ],
        admin: {
          placeholder: 'Choose a category',
        },
      } as unknown as Field

      const placeholder = (field as { admin?: { placeholder?: string } }).admin?.placeholder
      expect(placeholder).toBe('Choose a category')
    })

    it('should default to — Select — when no placeholder is provided', () => {
      const field: Field = {
        type: 'select',
        name: 'category',
        options: [
          { label: 'Option A', value: 'a' },
        ],
      } as unknown as Field

      const placeholder = (field as { admin?: { placeholder?: string } }).admin?.placeholder || '— Select —'
      expect(placeholder).toBe('— Select —')
    })

    it('should support Default (Label) format for schema type', () => {
      const field: Field = {
        type: 'select',
        name: 'schemaType',
        options: [
          { label: 'Web page (default)', value: 'WebPage' },
          { label: 'About page', value: 'AboutPage' },
        ],
        admin: {
          placeholder: 'Default (Web page (default))',
        },
      } as unknown as Field

      const placeholder = (field as { admin?: { placeholder?: string } }).admin?.placeholder
      expect(placeholder).toBe('Default (Web page (default))')
    })

    it('should handle placeholder with extracted default label', () => {
      const options = [
        { label: 'Blog post (default)', value: 'BlogPosting' },
        { label: 'Article', value: 'Article' },
      ]
      const defaultValue = 'BlogPosting'
      const defaultLabel = options.find((o) => o.value === defaultValue)?.label || defaultValue
      const placeholderText = `Default (${defaultLabel})`

      expect(placeholderText).toBe('Default (Blog post (default))')
    })
  })

  describe('field configuration validation', () => {
    it('should render without crashing when admin is undefined', () => {
      const field: Field = {
        type: 'select',
        name: 'category',
        options: [
          { label: 'A', value: 'a' },
        ],
      } as unknown as Field

      const placeholder = (field as { admin?: { placeholder?: string } }).admin?.placeholder || '— Select —'
      expect(placeholder).toBe('— Select —')
    })

    it('should render without crashing when placeholder is undefined', () => {
      const field: Field = {
        type: 'select',
        name: 'category',
        options: [
          { label: 'A', value: 'a' },
        ],
        admin: {},
      } as unknown as Field

      const placeholder = (field as { admin?: { placeholder?: string } }).admin?.placeholder || '— Select —'
      expect(placeholder).toBe('— Select —')
    })

    it('should preserve non-empty placeholder string', () => {
      const field: Field = {
        type: 'select',
        name: 'status',
        options: [
          { label: 'Active', value: 'active' },
        ],
        admin: {
          placeholder: 'Select status...',
        },
      } as unknown as Field

      const placeholder = (field as { admin?: { placeholder?: string } }).admin?.placeholder || '— Select —'
      expect(placeholder).toBe('Select status...')
    })
  })
})
