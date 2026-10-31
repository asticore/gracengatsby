// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { sanitizeConditions } from '@/features/siteTemplates/conditions'
import { CONDITION_KINDS, fromStoredConditions, summariseConditions, toStoredConditions, validateConditions } from '@/features/siteTemplates/conditionsSummary'

describe('site template conditions helpers', () => {
  it('summarises', () => {
    expect(summariseConditions([])).toBe('Everywhere for its type.')
    expect(summariseConditions(null)).toBe('Everywhere for its type.')
    expect(summariseConditions([[{ param: 'postCategory', operator: 'equals', value: 'News' }, { param: 'postTag', operator: 'notEquals', value: 'old' }], [{ param: 'path', operator: 'equals', value: '/x' }]])).toBe(
      'When post category is "News" and post tag is not "old", or when page path is "/x".',
    )
  })
  it('flags invalid, fail closed', () => {
    expect(validateConditions([[{ param: 'bogus', operator: 'equals', value: 'a' }]])).toMatch(/invalid/)
    expect(validateConditions('{nope')).not.toBeNull()
    expect(summariseConditions({})).toMatch(/not valid/)
    expect(validateConditions([])).toBeNull()
  })
  it('round-trips and drops blanks', () => {
    const groups = [[{ param: 'eventType' as const, operator: 'notEquals' as const, value: ' paid ' }, { param: 'path' as const, operator: 'equals' as const, value: '' }], [{ param: 'path' as const, operator: 'equals' as const, value: '' }]]
    const stored = toStoredConditions(groups)
    expect(stored).toEqual([[{ param: 'eventType', operator: 'notEquals', value: 'paid' }]])
    expect(fromStoredConditions(stored)).toEqual(stored)
    expect(sanitizeConditions(stored).valid).toBe(true)
    expect(fromStoredConditions('junk')).toBeNull()
  })
  it('every offered kind is accepted by the sanitizer', () => {
    const sample: Record<string, string> = { audience: 'members', page: '12,15' }
    for (const k of CONDITION_KINDS) expect(sanitizeConditions([[{ param: k.param, operator: 'equals', value: sample[k.param] ?? 'x' }]]).valid).toBe(true)
  })
})
