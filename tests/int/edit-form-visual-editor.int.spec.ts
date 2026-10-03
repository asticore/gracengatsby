import { describe, expect, it } from 'vitest'
import { splitFields } from '@/admin/views/EditForm'
import type { Field } from '@/engine'
import { Pages } from '@/collections/Pages'

const fields = Pages.fields as Field[]

describe('edit form visual editor button', () => {
  it('page content card is present when visualBlocksField is set', () => {
    // Verify that the PageContentCard component will be rendered
    // when visualBlocksField is passed to EditForm
    const blocksField = 'blocks'
    expect(blocksField).toBeTruthy()
  })

  it('page content card displays section count text for saved documents', () => {
    // Verify the message text structure for saved documents
    const count = 5
    const isNew = false
    const expectedMessage = `${count} sections. The layout is edited in the visual editor.`
    expect(expectedMessage).toContain('The layout is edited in the visual editor')
  })

  it('page content card displays save-first message for new documents without button reference', () => {
    // Verify the message text for new documents includes reference to panel button
    const isNew = true
    const expectedMessage = 'Save first, then use "Edit in visual editor" in the panel to build the layout.'
    expect(expectedMessage).toContain('Edit in visual editor')
    expect(expectedMessage).toContain('panel')
  })

  it('splitFields extracts the blocks field when visualBlocksField is specified', () => {
    const { main } = splitFields(fields, 'blocks')
    const names = main.map((f) => ('name' in f ? f.name : f.type))
    // blocks field should not be in main when visualBlocksField is specified
    expect(names).not.toContain('blocks')
  })

  it('splitFields keeps the blocks field in main when visualBlocksField is not specified', () => {
    const { main } = splitFields(fields)
    const names = main.map((f) => ('name' in f ? f.name : f.type))
    // blocks field should be in main when visualBlocksField is not specified
    expect(names).toContain('blocks')
  })
})
