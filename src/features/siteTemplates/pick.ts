/**
 * Which site template applies: the pure part of the resolver (no engine, no React), so the order and the scoping
 * are unit testable. resolve.ts loads the rows and calls this.
 *
 * Audience (members, guests, everyone) and page (a list of page ids) are ordinary rules, so they take part in the
 * same order: a member-only header beats the general header for a member, and an "everyone" rule does not count
 * towards specificity (it restricts nothing).
 */
import { matchesLocation } from '@/features/customFields/location'

import { sanitizeConditions, specificityOf } from './conditions'
import type { SiteTemplate, SiteTemplateKind, TemplateContext } from './types'

const priorityOf = (template: SiteTemplate): number => (typeof template.priority === 'number' && Number.isFinite(template.priority) ? template.priority : 0)

const idOrder = (a: SiteTemplate, b: SiteTemplate): number => {
  const x = Number(a.id)
  const y = Number(b.id)
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
}

/**
 * Which template of this kind applies, from an already loaded list. Pure, so the order and the scoping are
 * testable without the engine. Only enabled templates with blocks and valid conditions are candidates, and
 * their conditions must match the context. Order: highest priority, then most specific conditions (most
 * rules in one group; empty conditions are the fallback and rank last), then lowest id. Null when none match.
 */
export function pickSiteTemplate(all: SiteTemplate[], kind: SiteTemplateKind, ctx: TemplateContext = {}): SiteTemplate | null {
  const full = { ...ctx, templateKind: kind }
  const matching = all.filter((template) => {
    if (template.kind !== kind || template.enabled === false) return false
    if (!Array.isArray(template.blocks) || template.blocks.length === 0) return false
    const { groups, valid } = sanitizeConditions(template.conditions)
    if (!valid) return false
    return groups.length === 0 || matchesLocation(groups, full)
  })
  if (matching.length === 0) return null
  matching.sort((a, b) => priorityOf(b) - priorityOf(a) || specificityOf(b.conditions) - specificityOf(a.conditions) || idOrder(a, b))
  return matching[0]
}
