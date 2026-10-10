import type { LocationGroups, LocationRule } from '@/fields/customFields/types'

/**
 * Where a Field Group applies. Pure, so the admin panel (with unsaved form
 * values) and the server validation hook (with the saved document) share it.
 *
 * A context key that is `undefined` means "not applicable here" (eg a
 * pageTemplate rule while editing a post) and never matches, for either
 * operator. `null` means "applicable, but empty" (a page with no parent).
 */
export type LocationContext = {
  collection?: string | null
  optionsPage?: string | null
  pageTemplate?: string | number | null
  pageParent?: string | number | null
  postCategories?: string[] | null
  postTags?: string[] | null
  userRoles?: string[] | null
  status?: string | null
}

const asId = (value: string | number | null | undefined): string => (value === null || value === undefined ? '' : String(value))

function ruleMatches(rule: LocationRule, ctx: LocationContext): boolean {
  let hit: boolean
  switch (rule.param) {
    case 'collection':
      if (ctx.collection === undefined) return false
      hit = ctx.collection === rule.value
      break
    case 'optionsPage':
      if (ctx.optionsPage === undefined) return false
      hit = ctx.optionsPage === rule.value
      break
    case 'pageTemplate':
    case 'pageParent': {
      const raw = rule.param === 'pageTemplate' ? ctx.pageTemplate : ctx.pageParent
      if (raw === undefined) return false
      const current = asId(raw)
      hit = rule.value === 'none' ? current === '' : current === rule.value
      break
    }
    case 'postCategory':
      if (ctx.postCategories === undefined) return false
      hit = (ctx.postCategories ?? []).includes(rule.value)
      break
    case 'postTag':
      if (ctx.postTags === undefined) return false
      hit = (ctx.postTags ?? []).includes(rule.value)
      break
    case 'userRole':
      if (ctx.userRoles === undefined) return false
      hit = (ctx.userRoles ?? []).includes(rule.value)
      break
    case 'status':
      if (ctx.status === undefined) return false
      hit = ctx.status === rule.value
      break
    default:
      return false
  }
  return rule.operator === 'notEquals' ? !hit : hit
}

/** True when the location groups (OR of AND-rules) match the context. No groups = matches nothing. */
export function matchesLocation(location: LocationGroups | { location: LocationGroups }, ctx: LocationContext): boolean {
  const groups = Array.isArray(location) ? location : location.location
  if (!groups || groups.length === 0) return false
  return groups.some((rules) => rules.length > 0 && rules.every((rule) => ruleMatches(rule, ctx)))
}

/** Groups that could apply to a collection: they name it, or they name no collection at all. Options-page-only groups are excluded. */
export function couldApplyToCollection(location: LocationGroups, collection: string): boolean {
  if (location.length === 0) return false
  return location.some((rules) => {
    const collectionRules = rules.filter((r) => r.param === 'collection')
    if (collectionRules.length === 0) return !rules.some((r) => r.param === 'optionsPage')
    return collectionRules.some((r) => r.operator === 'equals' && r.value === collection)
  })
}
