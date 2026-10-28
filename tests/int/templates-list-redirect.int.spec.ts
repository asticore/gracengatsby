import { describe, expect, it } from 'vitest'

import { adminCollectionPath, hubListRedirect } from '@/admin/adminPaths'
import { filterHubRows, buildHubRows } from '@/features/templatesHub/rows'
import { parseListSearchParams as parseState } from '@/admin/list/listQuery'

describe('list routes of the Templates hub collections', () => {
  it('site templates open the hub with no type filter', () => {
    expect(hubListRedirect('site-templates')).toBe('/admin/templates')
  })

  it('page templates and reusable sections open the hub with their type preselected', () => {
    expect(hubListRedirect('page-templates')).toBe('/admin/templates?f=type%3Aequals%3Apage-template')
    expect(hubListRedirect('reusable-sections')).toBe('/admin/templates?f=type%3Aequals%3Areusable-section')
  })

  it('leaves every other collection list alone', () => {
    expect(hubListRedirect('pages')).toBeNull()
    expect(hubListRedirect('products')).toBeNull()
    expect(adminCollectionPath('page-templates')).toBe('/admin/content/page-templates')
  })

  it('the preselected filter selects exactly that type on the hub', () => {
    const target = hubListRedirect('reusable-sections') as string
    const query = Object.fromEntries(new URLSearchParams(target.split('?')[1]))
    const state = parseState(query)
    expect(state.filters).toEqual([{ field: 'type', op: 'equals', value: 'reusable-section' }])
    const rows = buildHubRows({
      siteTemplates: [{ id: 1, name: 'Header', kind: 'header', enabled: true }],
      pageTemplates: [{ id: 2, name: 'Landing' }],
      reusableSections: [{ id: 3, name: 'Hero' }],
    })
    expect(filterHubRows(rows, state.filters, '').map((r) => r.key)).toEqual(['reusable-sections:3'])
  })
})
