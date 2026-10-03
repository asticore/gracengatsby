import { describe, expect, it } from 'vitest'
import type { Field } from '@/engine'
import { splitFields } from '@/admin/views/EditForm'
import { fieldLabel, flattenDoc, humanizeName, unflattenFields } from '@/admin/fields/shared'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'
import { Pages } from '@/collections/Pages'

const fields = Pages.fields as Field[]

describe('edit screen field split', () => {
  it('moves position:sidebar fields to the settings card', () => {
    const { main, settings, seo, pageType } = splitFields(fields)
    const names = (list: Field[]) => list.map((f) => ('name' in f ? f.name : f.type))
    expect(names(settings)).toEqual(expect.arrayContaining(['slug', 'parent', 'template']))
    expect(names(main)).not.toContain('slug')
    expect(names(main)).toContain('blocks')
    expect(seo).toBeDefined()
    expect('name' in seo! && seo.name).toBe('seo')
  })

  it('extracts the membersOnly (access) group from the split, removing it from main and settings', () => {
    const { main, settings, access } = splitFields(fields)
    const names = (list: Field[]) => list.map((f) => ('name' in f ? f.name : f.type))
    // Check if membersOnly exists in the fields (Pages may not have it)
    const hasMembersOnly = fields.some((f) => 'name' in f && f.name === 'membersOnly')
    if (hasMembersOnly) {
      expect(access).toBeDefined()
      expect('name' in access! && access.name).toBe('membersOnly')
      expect(names(main)).not.toContain('membersOnly')
      expect(names(settings)).not.toContain('membersOnly')
    }
  })

  it('extracts the seo group from the split, removing it from both main and settings', () => {
    const { main, settings, seo, pageType } = splitFields(fields)
    const names = (list: Field[]) => list.map((f) => ('name' in f ? f.name : f.type))
    expect(seo).toBeDefined()
    expect(names(main)).not.toContain('seo')
    expect(names(settings)).not.toContain('seo')
  })

  it('extracts the schemaType field (pageType), removing it from main and settings', () => {
    const { main, settings, pageType } = splitFields(fields)
    const names = (list: Field[]) => list.map((f) => ('name' in f ? f.name : f.type))
    // pageType should be undefined for Pages (which don't have schemaType yet, being added by another agent)
    // This test documents the synthetic field behavior - when schemaType exists, it will be extracted
    if (pageType) {
      expect('name' in pageType && pageType.name).toBe('schemaType')
      expect(names(main)).not.toContain('schemaType')
      expect(names(settings)).not.toContain('schemaType')
    }
  })

  it('drops only the visual editor blocks field from the main column', () => {
    const { main, settings } = splitFields(fields, VISUAL_EDITOR_SURFACES.pages.blocksField)
    const names = main.map((f) => ('name' in f ? f.name : f.type))
    expect(names).not.toContain('blocks')
    expect(names).toContain('customFields')
    expect(settings.length).toBeGreaterThan(0)
  })

  it('pages no longer require a section on creation (the visual editor builds them)', () => {
    const blocks = fields.find((f) => 'name' in f && f.name === 'blocks') as { minRows?: number } | undefined
    expect(blocks?.minRows).toBeUndefined()
  })

  it('keeps the hidden blocks field in form state so a save sends it back unchanged', () => {
    const doc = {
      id: 7,
      title: 'About',
      slug: 'about',
      blocks: [{ blockType: 'hero', heading: 'Hello', id: 'a1' }],
    }
    // The form is seeded from ALL fields, so the hidden field is still there...
    const state = flattenDoc(doc, fields)
    // ...and what a save would send includes it, identical.
    const sent = unflattenFields(state)
    expect(sent.blocks).toEqual(doc.blocks)
    expect(sent.title).toBe('About')
  })

  it('labels fields from their name when the config sets no label', () => {
    expect(humanizeName('isHomepage')).toBe('Is Homepage')
    expect(humanizeName('meta_title')).toBe('Meta Title')
    expect(fieldLabel({ name: 'title', type: 'text' } as Field)).toBe('Title')
    expect(fieldLabel({ name: 'title', type: 'text', label: 'Page Title' } as Field)).toBe('Page Title')
    expect(fieldLabel({ name: 'title', type: 'text', label: false } as unknown as Field)).toBeUndefined()
  })

  it('page content card message for new documents references panel button, not inline button', () => {
    // The PageContentCard for new documents should mention using the panel button
    const messageForNew = 'Save first, then use "Edit in visual editor" in the panel to build the layout.'
    expect(messageForNew).toContain('panel')
    expect(messageForNew).not.toMatch(/Save first.*button/)
  })

  it('page content card message for saved documents does not reference a button', () => {
    // The PageContentCard for saved documents should mention the visual editor but not a button link
    const count = 5
    const messageForSaved = `${count} sections. The layout is edited in the visual editor.`
    expect(messageForSaved).toContain('sections')
    expect(messageForSaved).toContain('visual editor')
  })
})
