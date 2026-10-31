// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { matchesLocation } from '@/features/customFields/location'
import { sanitizeConditions, specificityOf } from '@/features/siteTemplates/conditions'
import { computeTemplateCoverage } from '@/features/siteTemplates/coverage'
import { pickSiteTemplate } from '@/features/siteTemplates/pick'
import { summariseConditions, toStoredConditions, validateConditions } from '@/features/siteTemplates/conditionsSummary'
import { normalisePagePath } from '@/features/siteTemplates/audience'
import type { LocationRule } from '@/fields/customFields/types'
import type { SiteTemplate } from '@/features/siteTemplates/types'

const rule = (param: string, value: string, operator: 'equals' | 'notEquals' = 'equals') => ({ param, operator, value }) as LocationRule
const header = (id: number, conditions: unknown, extra: Partial<SiteTemplate> = {}): SiteTemplate => ({
  id,
  name: `Header ${id}`,
  kind: 'header',
  enabled: true,
  priority: 10,
  conditions,
  blocks: [{ blockType: 'text', text: `H${id}` }],
  ...extra,
})

describe('audience condition', () => {
  it('accepts members, guests and everyone and rejects anything else (fail closed)', () => {
    for (const value of ['members', 'guests', 'everyone']) expect(sanitizeConditions([[rule('audience', value)]]).valid).toBe(true)
    expect(sanitizeConditions([[rule('audience', 'vip')]]).valid).toBe(false)
    expect(sanitizeConditions([[rule('audience', 'Members')]]).valid).toBe(false)
    expect(validateConditions([[rule('audience', 'vip')]])).toMatch(/invalid/)
  })

  it('matches by the visitor audience; everyone matches any known audience; unknown audience never matches', () => {
    const members = [[rule('audience', 'members')]]
    expect(matchesLocation(members, { audience: 'members' })).toBe(true)
    expect(matchesLocation(members, { audience: 'guests' })).toBe(false)
    expect(matchesLocation([[rule('audience', 'everyone')]], { audience: 'guests' })).toBe(true)
    expect(matchesLocation([[rule('audience', 'guests', 'notEquals')]], { audience: 'members' })).toBe(true)
    expect(matchesLocation(members, {})).toBe(false)
  })

  it('does not count "everyone" towards specificity, but counts a real audience rule', () => {
    expect(specificityOf([[rule('audience', 'everyone')]])).toBe(0)
    expect(specificityOf([[rule('audience', 'members')]])).toBe(1)
    expect(specificityOf([[rule('audience', 'members'), rule('path', '/shop')]])).toBe(2)
  })
})

describe('page condition', () => {
  it('takes a comma separated list of page ids and rejects typed text', () => {
    expect(sanitizeConditions([[rule('page', '12')]]).valid).toBe(true)
    expect(sanitizeConditions([[rule('page', '12,15,18')]]).valid).toBe(true)
    expect(sanitizeConditions([[rule('page', 'about')]]).valid).toBe(false)
    expect(sanitizeConditions([[rule('page', '12,,15')]]).valid).toBe(false)
    expect(sanitizeConditions([[rule('page', '1'.repeat(1100))]]).valid).toBe(false)
  })

  it('matches when the current page is any listed id, and exclude removes them', () => {
    expect(matchesLocation([[rule('page', '12,15')]], { pageId: '15' })).toBe(true)
    expect(matchesLocation([[rule('page', '12,15')]], { pageId: '13' })).toBe(false)
    expect(matchesLocation([[rule('page', '12,15', 'notEquals')]], { pageId: '13' })).toBe(true)
    expect(matchesLocation([[rule('page', '12,15', 'notEquals')]], { pageId: '12' })).toBe(false)
    // A request that is not a published page is not any listed page, so an exclude still applies to it.
    expect(matchesLocation([[rule('page', '12', 'notEquals')]], { pageId: null })).toBe(true)
    expect(matchesLocation([[rule('page', '12')]], { pageId: null })).toBe(false)
    expect(matchesLocation([[rule('page', '12')]], {})).toBe(false)
  })

  it('a page picker value round-trips through the stored form', () => {
    const stored = toStoredConditions([[{ param: 'page', operator: 'equals', value: ' 12,15 ' }]])
    expect(stored).toEqual([[{ param: 'page', operator: 'equals', value: '12,15' }]])
  })

  it('summary names the pages by title when titles are known', () => {
    expect(summariseConditions([[rule('page', '12,15')]], { '12': 'Home visit', '15': 'Shop' })).toBe('When page is "Home visit" or "Shop".')
    expect(summariseConditions([[rule('page', '99')]])).toBe('When page is "page 99".')
  })
})

describe('audience and page in the picker order', () => {
  const ctx = (audience: 'members' | 'guests', pageId: string | null = null) => ({ path: '/', audience, pageId })

  it('a members-only header beats the general header for a signed-in visitor, the general one serves guests', () => {
    const general = header(1, [])
    const members = header(2, [[rule('audience', 'members')]])
    expect(pickSiteTemplate([general, members], 'header', ctx('members'))?.id).toBe(2)
    expect(pickSiteTemplate([general, members], 'header', ctx('guests'))?.id).toBe(1)
  })

  it('priority still wins over audience specificity', () => {
    const members = header(2, [[rule('audience', 'members')]], { priority: 1 })
    const general = header(1, [], { priority: 50 })
    expect(pickSiteTemplate([general, members], 'header', ctx('members'))?.id).toBe(1)
  })

  it('an "everyone" header ties with the general one and the lower id wins', () => {
    const everyone = header(5, [[rule('audience', 'everyone')]])
    const general = header(3, [])
    expect(pickSiteTemplate([everyone, general], 'header', ctx('guests'))?.id).toBe(3)
  })

  it('a page header is more specific than a general one, and an audience-only header does not apply to other pages', () => {
    const general = header(1, [])
    const onPage = header(2, [[rule('page', '7')]])
    expect(pickSiteTemplate([general, onPage], 'header', ctx('guests', '7'))?.id).toBe(2)
    expect(pickSiteTemplate([general, onPage], 'header', ctx('guests', '8'))?.id).toBe(1)
    const membersOnPage = header(3, [[rule('audience', 'members'), rule('page', '7')]])
    expect(pickSiteTemplate([onPage, membersOnPage], 'header', ctx('members', '7'))?.id).toBe(3)
  })
})

describe('coverage with audiences and pages', () => {
  it('a members header and a guest header together cover the whole site', () => {
    const warnings = computeTemplateCoverage([
      header(1, [[rule('audience', 'members')]]),
      header(2, [[rule('audience', 'guests')]]),
    ])
    expect(warnings.filter((w) => w.kind === 'header' && w.code === 'partial')).toHaveLength(0)
  })

  it('a members-only header alone leaves guests without one, so it is reported as partial', () => {
    const warnings = computeTemplateCoverage([header(1, [[rule('audience', 'members')]])])
    expect(warnings.some((w) => w.kind === 'header' && w.code === 'partial')).toBe(true)
  })

  it('an everyone header covers the whole site', () => {
    const warnings = computeTemplateCoverage([header(1, [[rule('audience', 'everyone')]])])
    expect(warnings.filter((w) => w.kind === 'header' && w.code === 'partial')).toHaveLength(0)
  })
})

describe('normalisePagePath', () => {
  it('drops the query, trailing slash and a locale segment', () => {
    expect(normalisePagePath('/about/?x=1')).toBe('/about')
    expect(normalisePagePath('/')).toBe('/')
    expect(normalisePagePath('/fr/about', ['en', 'fr'])).toBe('/about')
    expect(normalisePagePath('/fr/about', [])).toBe('/fr/about')
  })
})
