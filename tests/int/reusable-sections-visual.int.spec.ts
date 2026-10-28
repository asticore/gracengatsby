// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Field } from '@/engine'
import { ReusableSections } from '@/collections/ReusableSections'
import { splitFields } from '@/admin/views/EditForm'
import { adminCollectionPath } from '@/admin/adminPaths'
import { buildHubRows } from '@/features/templatesHub/rows'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'

const fields = ReusableSections.fields as Field[]

describe('reusable-sections visual builder surface', () => {
  it('is registered like page-templates and site-templates: a collection whose blocks field is the content', () => {
    expect(VISUAL_EDITOR_SURFACES['reusable-sections']).toMatchObject({
      kind: 'collection',
      slug: 'reusable-sections',
      label: 'Reusable Section',
      blocksField: 'blocks',
      titleField: 'name',
    })
  })

  it('keeps its blocks field, which the visual builder reads and writes', () => {
    const blocks = fields.find((f) => 'name' in f && f.name === 'blocks')
    expect(blocks?.type).toBe('blocks')
  })

  it('shows the Edit visually button on the edit screen, before the lock control', () => {
    const edit = ReusableSections.admin?.components?.edit as { beforeDocumentControls?: string[] } | undefined
    expect(edit?.beforeDocumentControls).toEqual([
      '@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton',
      '@/fields/locks/DocumentLockControl#DocumentLockControl',
    ])
  })

  it('hides the blocks field from the edit form main column, since the visual builder owns it', () => {
    const { main } = splitFields(fields, VISUAL_EDITOR_SURFACES['reusable-sections'].blocksField)
    const names = main.map((f) => ('name' in f ? f.name : f.type))
    expect(names).not.toContain('blocks')
    expect(names).toContain('name')
  })

  it('links the templates hub row to the visual builder, as page and site templates do', () => {
    const [row] = buildHubRows({ reusableSections: [{ id: 9, name: 'Footer strip', updatedAt: null }] })
    expect(row).toMatchObject({
      visualHref: '/admin/visual-editor/collection/reusable-sections/9',
      editHref: adminCollectionPath('reusable-sections') + '/9',
    })
  })
})
