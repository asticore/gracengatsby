import { describe, expect, it } from 'vitest'
import type { Field } from '@/engine'
import { splitFields } from '@/admin/views/EditForm'
import { flattenDoc, unflattenFields } from '@/admin/fields/shared'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'
import { Pages } from '@/collections/Pages'

const fields = Pages.fields as Field[]

describe('edit screen field split', () => {
  it('moves position:sidebar fields to the right panel', () => {
    const { main, sidebar } = splitFields(fields)
    const names = (list: Field[]) => list.map((f) => ('name' in f ? f.name : f.type))
    expect(names(sidebar)).toEqual(expect.arrayContaining(['slug', 'parent', 'template']))
    expect(names(main)).not.toContain('slug')
    expect(names(main)).toContain('blocks')
  })

  it('drops only the visual editor blocks field from the main column', () => {
    const { main, sidebar } = splitFields(fields, VISUAL_EDITOR_SURFACES.pages.blocksField)
    const names = main.map((f) => ('name' in f ? f.name : f.type))
    expect(names).not.toContain('blocks')
    expect(names).toContain('customFields')
    expect(sidebar.length).toBeGreaterThan(0)
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
})
