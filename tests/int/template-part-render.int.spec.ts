import { describe, expect, it, vi } from 'vitest'

import { templatePartIdsIn } from '@/features/siteTemplates/nodes'

const text = (id: string) => ({ blockType: 'element', elementType: 'heading', props: { text: id }, _id: id })
const part = (templateId: unknown) => ({ blockType: 'element', elementType: 'template-part', props: { templateId } })

const state = vi.hoisted(() => ({ template: null as unknown, blocks: [] as unknown[], rendered: [] as unknown[] }))

describe('template part element render', () => {
  vi.mock('@/features/siteTemplates/resolve', () => ({
    loadSiteTemplate: vi.fn(async (id: number | string) => (state.template && (state.template as { id: unknown }).id === Number(id) ? state.template : null)),
    prepareTemplateBlocks: vi.fn(async () => state.blocks),
  }))
  vi.mock('@/features/siteTemplates/render', () => ({
    renderTemplateBlocks: (blocks: unknown[]) => {
      state.rendered = blocks
      return 'RENDERED'
    },
  }))

  it('draws the chosen template inside a wrapper, with nested parts removed', async () => {
    const { TemplatePartElement } = await import('@/components/blocks/elements/TemplatePartServer')
    state.template = { id: 7, enabled: true, kind: 'sidebar-left', blocks: [text('x')] }
    state.blocks = [text('menu'), part(2)]
    const element = (await TemplatePartElement({ templateId: 7 })) as unknown as { props: Record<string, unknown> }
    expect(element).toBeTruthy()
    expect(element.props['data-template-part']).toBe('7')
    expect(element.props.className).toBe('eg-template-part')
    expect(element.props.children).toBe('RENDERED')
    expect(templatePartIdsIn(state.rendered)).toEqual([])
    expect(JSON.stringify(state.rendered)).toContain('menu')
  })

  it('draws nothing for a missing id, a switched-off template or a template with no blocks', async () => {
    const { TemplatePartElement } = await import('@/components/blocks/elements/TemplatePartServer')
    expect(await TemplatePartElement({})).toBeNull()
    expect(await TemplatePartElement({ templateId: 0 })).toBeNull()
    state.template = { id: 7, enabled: false, blocks: [text('x')] }
    expect(await TemplatePartElement({ templateId: 7 })).toBeNull()
    state.template = { id: 7, enabled: true, blocks: [] }
    state.blocks = []
    expect(await TemplatePartElement({ templateId: 7 })).toBeNull()
  })
})

