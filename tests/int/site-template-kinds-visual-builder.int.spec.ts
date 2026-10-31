// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SiteTemplates } from '@/collections/SiteTemplates'
import { adminCollectionPath } from '@/admin/adminPaths'
import { SITE_TEMPLATE_KINDS, TEMPLATE_TYPE_TABS, KIND_LABELS } from '@/features/siteTemplates/kinds'
import { sampleCollectionFor } from '@/lib/blockContextFrom'
import { buildHubRows, type HubSourceDoc } from '@/features/templatesHub/rows'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'

// Every site template kind must open in the visual builder from the Templates hub, the same way. The builder route is
// /visual-editor/:mode/:slug/:id? (see admin/views/RootPage.tsx), so the check follows that shape.
const ROUTE = ['visual-editor', ':mode', ':slug', ':id?']

function matchesBuilderRoute(pathname: string): { slug: string; id: string } | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== ROUTE[0] || parts[1] !== 'collection' || parts.length !== 4) return null
  return { slug: parts[2], id: parts[3] }
}

const siteTemplateFor = (kind: string, id: number): HubSourceDoc => ({ id, name: `${KIND_LABELS[kind as keyof typeof KIND_LABELS]} template`, kind, enabled: true, priority: 1, updatedAt: null, conditions: [] } as unknown as HubSourceDoc)

describe('every site template kind opens in the visual builder', () => {
  it('has one visual builder surface for site templates, with the blocks field the builder reads and writes', () => {
    expect(VISUAL_EDITOR_SURFACES['site-templates']).toMatchObject({ kind: 'collection', slug: 'site-templates', blocksField: 'blocks', titleField: 'name' })
    const blocks = (SiteTemplates.fields as Array<{ name?: string; type?: string }>).find((f) => f.name === 'blocks')
    expect(blocks?.type).toBe('blocks')
  })

  it('the edit screen shows the Edit visually button for every kind (it is one collection, not one per kind)', () => {
    const edit = SiteTemplates.admin?.components?.edit as { beforeDocumentControls?: string[] } | undefined
    expect(edit?.beforeDocumentControls).toContain('@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton')
  })

  it('the kind select offers exactly the kinds the hub and resolver know', () => {
    const kind = (SiteTemplates.fields as Array<{ name?: string; options?: Array<{ value: string }> }>).find((f) => f.name === 'kind')
    expect(kind?.options?.map((o) => o.value)).toEqual([...SITE_TEMPLATE_KINDS])
  })

  it.each(SITE_TEMPLATE_KINDS.map((kind, i) => [kind, i + 1] as const))('%s: the hub links to the builder and the route matches', (kind, id) => {
    const [row] = buildHubRows({ siteTemplates: [siteTemplateFor(kind, id)] })
    expect(row.visualHref).toBe(`/admin/visual-editor/collection/site-templates/${id}`)
    const route = matchesBuilderRoute(row.visualHref!.replace(/^\/admin/, ''))
    expect(route).toEqual({ slug: 'site-templates', id: String(id) })
    expect(VISUAL_EDITOR_SURFACES[route!.slug]).toBeDefined()
    expect(row.editHref).toBe(`${adminCollectionPath('site-templates')}/${id}`)
  })

  it.each(SITE_TEMPLATE_KINDS.map((kind) => [kind] as const))('%s: sits on exactly one Templates tab', (kind) => {
    const tabs = TEMPLATE_TYPE_TABS.filter((tab) => tab.kinds.includes(kind))
    expect(tabs).toHaveLength(1)
  })

  it.each(SITE_TEMPLATE_KINDS.map((kind) => [kind] as const))('%s: Preview as has a sample only for single-item kinds', (kind) => {
    const sample = sampleCollectionFor(kind)
    if (kind === 'single-post') expect(sample).toBe('posts')
    else if (kind === 'single-product') expect(sample).toBe('products')
    else if (kind === 'single-event') expect(sample).toBe('events')
    else expect(sample).toBeNull()
  })
})
