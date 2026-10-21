import { describe, expect, it } from 'vitest'

import { SITE_TEMPLATE_KINDS } from '@/collections/SiteTemplates'
import { STARTERS } from '@/features/siteTemplates/starters'

const NEW_KINDS = ['search-results', 'archive-category', 'archive-tag', 'archive-author'] as const

describe('new site template kinds', () => {
  it('are registered', () => {
    for (const kind of NEW_KINDS) expect(SITE_TEMPLATE_KINDS).toContain(kind)
  })

  it('each has exactly one starter with a heading and a content slot', () => {
    for (const kind of NEW_KINDS) {
      const found = STARTERS.filter((s) => s.kind === kind)
      expect(found).toHaveLength(1)
      const json = JSON.stringify(found[0].blocks())
      expect(json).toContain('heading')
      expect(json).toContain('content-slot')
    }
  })
})
