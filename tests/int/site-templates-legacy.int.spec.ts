// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { upgradeLegacyElements } from '@/features/siteTemplates/nodes'

describe('upgradeLegacyElements', () => {
  it('maps the old breadcrumbs element to Auto breadcrumbs, at top level and inside sections', () => {
    const blocks = [
      { blockType: 'element', elementType: 'breadcrumbs', props: { items: [{ label: 'Home', url: '/' }], separator: '>' } },
      {
        blockType: 'section',
        columns: [{ width: 12, blocks: [{ blockType: 'element', elementType: 'breadcrumbs', props: {} }, { blockType: 'element', elementType: 'heading', props: { text: 'Hi' } }] }],
      },
    ]
    const out = upgradeLegacyElements(blocks) as Array<Record<string, unknown>>
    expect(out[0]).toMatchObject({ blockType: 'element', elementType: 'auto-breadcrumbs', props: {} })
    const inner = (out[1].columns as Array<{ blocks: Array<Record<string, unknown>> }>)[0].blocks
    expect(inner[0]).toMatchObject({ elementType: 'auto-breadcrumbs' })
    expect(inner[1]).toMatchObject({ elementType: 'heading', props: { text: 'Hi' } })
    expect(blocks[0].elementType).toBe('breadcrumbs')
  })
})
