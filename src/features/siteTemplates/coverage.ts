import type { LocationGroups, LocationRule } from '@/fields/customFields/types'

import { sanitizeConditions, specificityOf } from './conditions'
import { summariseConditions } from './conditionsSummary'
import { KIND_LABELS, OPTIONAL_KINDS, SITE_TEMPLATE_KINDS, type SiteTemplateKind } from './kinds'

/** The part of a site-templates row the coverage check reads. Matches the resolver's rules for "in use". */
export type CoverageTemplate = {
  id: number | string
  name?: string | null
  kind: SiteTemplateKind
  enabled?: boolean | null
  priority?: number | null
  conditions?: unknown
  blocks?: unknown[] | null
}

export type CoverageWarning = {
  code: 'missing' | 'partial' | 'overlap'
  kind: SiteTemplateKind
  /** Templates the warning is about (for overlaps the winner comes first). */
  templateIds: Array<number | string>
  message: string
}

/** What the site shows for each kind when no template is in use. Plain English, shown on the dashboard. */
export const MISSING_MESSAGES: Record<SiteTemplateKind, string> = {
  header: 'No header: the site shows the default header on every page',
  footer: 'No footer: the site shows the default footer on every page',
  'single-post': 'No single post template: posts show the default post layout',
  'single-product': 'No single product template: products show the default product layout',
  'single-event': 'No single event template: events show the default event layout',
  'archive-blog': 'No blog archive template: the blog list shows the default layout',
  'archive-shop': 'No shop archive template: the shop list shows the default layout',
  'not-found': 'No 404 template: the site shows its default "page not found" page',
  'search-results': 'No search results template: /search shows the default results layout',
  'archive-category': 'No category archive template: category pages show the default layout',
  'archive-tag': 'No tag archive template: tag pages show the default layout',
  'archive-author': 'No author archive template: author pages show the default layout',
  // Loop item templates are drawn by a Loop grid, and sidebars are optional, so a missing one is not a coverage gap.
  loop: 'No loop item template',
  'sidebar-left': 'No left sidebar: pages have no left sidebar',
  'sidebar-right': 'No right sidebar: pages have no right sidebar',
}

/** Same rule the resolver uses: enabled (null counts as on), has blocks, conditions understood. */
export function isInUse(template: CoverageTemplate): boolean {
  if (template.enabled === false) return false
  if (!Array.isArray(template.blocks) || template.blocks.length === 0) return false
  return sanitizeConditions(template.conditions).valid
}

const priorityOf = (t: CoverageTemplate): number => (typeof t.priority === 'number' && Number.isFinite(t.priority) ? t.priority : 0)

const idOrder = (a: CoverageTemplate, b: CoverageTemplate): number => {
  const x = Number(a.id)
  const y = Number(b.id)
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
}

/** Winner order used by the resolver: highest priority, then most specific conditions, then lowest id. */
const winnerOrder = (a: CoverageTemplate, b: CoverageTemplate): number =>
  priorityOf(b) - priorityOf(a) || specificityOf(b.conditions) - specificityOf(a.conditions) || idOrder(a, b)

const nameOf = (t: CoverageTemplate): string => (t.name && t.name.trim() !== '' ? t.name.trim() : `Untitled ${t.id}`)

/**
 * Whether the union of these templates' condition groups matches every page. Conservative and exact for the
 * shapes the editor produces:
 * - a group that is empty after dropping always-true `templateKind` rules matches everywhere;
 * - single-rule groups on the same param cover everything when two different values are "is not"ed, or the
 *   same value is both "is" and "is not"ed;
 * - audience: the single-rule audience groups together reach both members and guests (`everyone` reaches both).
 * Multi-rule groups only narrow the match, so they are not counted towards full coverage.
 */
export function coversEverywhere(groupSets: LocationGroups[], kind: SiteTemplateKind): boolean {
  const singles = new Map<LocationRule['param'], { is: Set<string>; isNot: Set<string> }>()
  // The audiences (members, guests) the single-rule audience groups reach between them.
  const audiences = new Set<string>()
  const AUDIENCE_NAMES = ['members', 'guests']
  // A templateKind rule is always true for this kind ("is" the kind, or "is not" another kind) or never true.
  const templateKindIsTrue = (rule: LocationRule): boolean =>
    (rule.operator === 'equals' && rule.value === kind) || (rule.operator === 'notEquals' && rule.value !== kind)
  for (const groups of groupSets) {
    for (const group of groups) {
      if (group.some((rule) => rule.param === 'templateKind' && !templateKindIsTrue(rule))) continue
      const rules = group.filter((rule) => rule.param !== 'templateKind')
      if (rules.length === 0) return true
      if (rules.length === 1 && rules[0].param === 'audience') {
        const [rule] = rules
        for (const name of AUDIENCE_NAMES) {
          const reached = rule.operator === 'equals' ? rule.value === 'everyone' || rule.value === name : rule.value !== name && rule.value !== 'everyone'
          if (reached) audiences.add(name)
        }
        continue
      }
      if (rules.length === 1) {
        const [rule] = rules
        const entry = singles.get(rule.param) ?? { is: new Set<string>(), isNot: new Set<string>() }
        if (rule.operator === 'equals') entry.is.add(rule.value)
        else entry.isNot.add(rule.value)
        singles.set(rule.param, entry)
      }
    }
  }
  if (audiences.size === AUDIENCE_NAMES.length) return true
  for (const { is, isNot } of singles.values()) {
    if (isNot.size >= 2) return true
    for (const value of isNot) if (is.has(value)) return true
  }
  return false
}

/** Canonical key so templates with the same conditions group together, whatever the row order. */
const conditionsKey = (groups: LocationGroups): string =>
  JSON.stringify(
    groups
      .map((group) => group.map((r) => `${r.param}\u0000${r.operator}\u0000${r.value}`).sort())
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  )

/** "Shop header" applies when page path is "/shop" (the summary without its leading "When" and final full stop). */
const appliesWhen = (t: CoverageTemplate): string => {
  const text = summariseConditions(t.conditions)
  const body = text.startsWith('When ') ? text.slice(5).replace(/\.$/, '') : text.replace(/\.$/, '')
  return `"${nameOf(t)}" applies when ${body}`
}

/**
 * Warnings for the Templates dashboard, in kind order. Pure: no I/O, never throws on odd input (invalid rows
 * are treated as not in use, exactly as the resolver treats them).
 *
 * - missing: no template of a kind is in use, so the site shows its default there (or says why none is used)
 * - partial: a header or footer is in use but its conditions do not cover the whole site
 * - overlap: two or more templates of one kind are in use with equal conditions; the highest priority wins
 */
export function computeTemplateCoverage(templates: CoverageTemplate[]): CoverageWarning[] {
  const warnings: CoverageWarning[] = []
  for (const kind of SITE_TEMPLATE_KINDS) {
    if (kind === 'loop') continue
    const ofKind = templates.filter((t) => t.kind === kind)
    const inUse = ofKind.filter(isInUse)

    if (inUse.length === 0) {
      // Sidebars are optional: no template means no sidebar, which is not a gap. Overlaps are still reported below.
      if (OPTIONAL_KINDS.includes(kind)) continue
      const note = ofKind.length > 0 ? ` A ${KIND_LABELS[kind].toLowerCase()} template exists but is switched off, empty or has invalid conditions, so it is not used.` : ''
      warnings.push({ code: 'missing', kind, templateIds: ofKind.map((t) => t.id), message: `${MISSING_MESSAGES[kind]}.${note}` })
      continue
    }

    if ((kind === 'header' || kind === 'footer') && !coversEverywhere(
        inUse.map((t) => {
          // No conditions means everywhere for the kind: one empty group, which matches every page.
          const { groups } = sanitizeConditions(t.conditions)
          return groups.length === 0 ? [[]] : groups
        }),
        kind,
      )) {
      const parts = inUse.slice().sort(winnerOrder).map(appliesWhen).join('; ')
      warnings.push({
        code: 'partial',
        kind,
        templateIds: inUse.map((t) => t.id),
        message: `The ${KIND_LABELS[kind].toLowerCase()} does not cover the whole site: ${parts}. Other pages have no ${KIND_LABELS[kind].toLowerCase()} template, so they show the default ${KIND_LABELS[kind].toLowerCase()}.`,
      })
    }

    const clusters = new Map<string, CoverageTemplate[]>()
    for (const t of inUse) {
      const key = conditionsKey(sanitizeConditions(t.conditions).groups)
      clusters.set(key, [...(clusters.get(key) ?? []), t])
    }
    for (const members of clusters.values()) {
      if (members.length < 2) continue
      const ordered = members.slice().sort(winnerOrder)
      const [winner, runnerUp] = ordered
      const list = ordered.map((t) => `"${nameOf(t)}" (priority ${priorityOf(t)})`).join(', ')
      const tie = priorityOf(winner) === priorityOf(runnerUp)
      const reason = tie ? 'they have the same priority, so the lower id wins' : 'it has the highest priority'
      warnings.push({
        code: 'overlap',
        kind,
        templateIds: ordered.map((t) => t.id),
        message: `${members.length} ${KIND_LABELS[kind].toLowerCase()} templates have the same conditions: ${list}. "${nameOf(winner)}" is used on those pages because ${reason}; the others are never shown there.`,
      })
    }
  }
  return warnings
}
