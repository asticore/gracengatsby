/**
 * Checks the model's reply before anything reaches the editor.
 *
 * The reply is treated as untrusted. Only the JSON object is kept (code fences and
 * prose around it are dropped); each section, column, element, design key and prop
 * is rebuilt from the registry and the design table, so anything the builder does
 * not know is removed rather than stored. Removals are reported as warnings. The
 * result gets fresh editor ids, the same way paste does.
 */

import type { EditorField } from '@/lib/elements/fieldTypes'
import { getElementDef, type ElementDef } from '@/lib/elements/registry'
import { paragraph } from '@/lib/elements/wave26Defs'
import { asBlockStyle, isSafeColor } from '@/lib/blockStyle'
import { parseColumnLayout, parseSectionLayout } from '@/lib/sectionLayout'
import type { SectionColumn, SectionNode } from '@/lib/sectionTree'
import { BUILT_IN_FONTS } from '@/features/fonts/installed'
import { withFreshIds } from '@/views/visualEditor/editorClipboard'

import { designSpec } from './builderDesign'
import { builderElements, type BuilderMode } from './builderGuide'

export const BUILDER_LIMITS = {
  maxNodes: 300,
  maxSections: 12,
  /** Sections the builder returns for one section or edit request. */
  maxSectionsForSection: 3,
  maxDepth: 8,
  maxReplyChars: 1_000_000,
  maxTextChars: 2000,
  maxRichTextChars: 4000,
  maxRepeatItems: 40,
}

export type BuilderValidation = { ok: true; sections: SectionNode[]; warnings: string[] } | { ok: false; error: string }

class BuilderError extends Error {}

const isPlain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Finds the one JSON value in a reply: whole reply, a code fence, or the outermost braces or brackets. */
export function extractJson(text: string): unknown {
  const candidates: string[] = []
  const trimmed = text.trim()
  candidates.push(trimmed)
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fence) candidates.push(fence[1].trim())
  const objectStart = trimmed.indexOf('{')
  const objectEnd = trimmed.lastIndexOf('}')
  if (objectStart !== -1 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1))
  const arrayStart = trimmed.indexOf('[')
  const arrayEnd = trimmed.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) candidates.push(trimmed.slice(arrayStart, arrayEnd + 1))
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown
      if (value && typeof value === 'object') return value
    } catch {
      // try the next candidate
    }
  }
  return undefined
}

/** True for http(s), site-relative and anchor/mail/tel links. Never javascript:, data: or protocol-relative. */
export function isSafeUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (text.length > 2000) return false
  if (/[\x00-\x1f\x7f\\"'<>\s]/.test(text)) return false
  return /^(https:\/\/|http:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(text) || text === ''
}

/** Removes script and frame blocks and any tag-like markup from a text value; caps its length. */
export function cleanText(value: string, max: number): string {
  let text = value.replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
  text = text.replace(/<\/?[a-zA-Z!][^<>]*>/g, '')
  text = text.replace(/(javascript|vbscript)\s*:/gi, '').replace(/data\s*:\s*text\/html/gi, '')
  return text.slice(0, max)
}

/** Lexical JSON from the model: strings cleaned, unsafe link targets emptied. Bounded in depth and size. */
function cleanRich(value: unknown, depth: number): unknown {
  if (depth > 30) return undefined
  if (typeof value === 'string') return cleanText(value, BUILDER_LIMITS.maxRichTextChars)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 2000).map((item) => cleanRich(item, depth + 1)).filter((item) => item !== undefined)
  if (isPlain(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue
      if ((key === 'url' || key === 'href') && typeof item === 'string') {
        out[key] = isSafeUrl(item) ? item : ''
        continue
      }
      const cleaned = cleanRich(item, depth + 1)
      if (cleaned !== undefined) out[key] = cleaned
    }
    return out
  }
  return undefined
}

export const MEDIA_QUERY_MAX_CHARS = 80
export const MEDIA_ALT_MAX_CHARS = 200

/** A picture the model asked for by description. Resolved or removed by builderMedia before it reaches the editor. */
export type MediaPlaceholder = { mediaQuery: string; alt: string }

export const isMediaPlaceholder = (value: unknown): value is MediaPlaceholder =>
  isPlain(value) && typeof value.mediaQuery === 'string' && Object.keys(value).every((key) => key === 'mediaQuery' || key === 'alt')

const DESIGN_FONT_KEY = 'fontFamily'
const BUILT_IN_FONT_VALUES = new Set(BUILT_IN_FONTS.map((font) => font.value))

/** Checks one design value against its spec. Ranges clamp; enums and colours drop when wrong. */
function checkDesignValue(kind: string, value: unknown): unknown {
  if (kind === 'colour') return isSafeColor(value) ? value : undefined
  if (kind === 'bool') return typeof value === 'boolean' ? value : undefined
  if (kind === 'font') return typeof value === 'string' && BUILT_IN_FONT_VALUES.has(value) ? value : undefined
  if (kind === 'object') return isPlain(value) ? value : undefined
  const range = /^num:(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(kind)
  if (range) {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    if (!Number.isFinite(n)) return undefined
    return Math.min(Number(range[2]), Math.max(Number(range[1]), n))
  }
  return typeof value === 'string' && kind.split('|').includes(value) ? value : undefined
}

/** Narrow design check for sections, columns and elements. Unknown keys and bad values are dropped with a warning. */
function cleanDesign(raw: unknown, isSection: boolean, warnings: Set<string>): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isPlain(raw)) {
    warnings.add('A design that was not an object was left out.')
    return undefined
  }
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    if (key === 'layout') {
      const layout = isSection ? parseSectionLayout(value) : undefined
      if (layout) kept.layout = layout
      else warnings.add(isSection ? 'A section layout setting was not valid and was removed.' : 'Layout settings are only used on sections and were removed.')
      continue
    }
    if (key === 'tablet' || key === 'mobile') {
      kept[key] = value
      continue
    }
    const kind = designSpec(key)
    if (!kind) {
      warnings.add('Some design settings the builder cannot set were removed.')
      continue
    }
    const checked = checkDesignValue(kind, value)
    if (checked === undefined) {
      warnings.add(`The design setting "${key}" had a value that is not allowed and was removed.`)
      continue
    }
    kept[key] = checked
  }
  // The shared sanitiser clamps and checks the keys it knows (effects, typography, overrides).
  const styled = asBlockStyle(kept) as Record<string, unknown>
  for (const key of Object.keys(kept)) {
    if (styled[key] === undefined && key !== DESIGN_FONT_KEY) warnings.add(`The design setting "${key}" was not valid and was removed.`)
  }
  return Object.keys(styled).length > 0 ? styled : undefined
}

/** Shapes one field value, or returns undefined to drop it. */
function cleanField(field: EditorField, value: unknown, warnings: Set<string>, depth: number): unknown {
  if (value === undefined || value === null) return undefined
  const isUrlName = /(url|href|link)$/i.test(field.name)
  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string') return undefined
      if (isUrlName) {
        if (!isSafeUrl(value)) {
          warnings.add('A link that is not allowed (script or data address) was removed.')
          return undefined
        }
        return value.trim()
      }
      return cleanText(value, field.type === 'text' ? BUILDER_LIMITS.maxTextChars : BUILDER_LIMITS.maxRichTextChars)
    }
    case 'richText': {
      if (typeof value === 'string') return paragraph(cleanText(value, BUILDER_LIMITS.maxRichTextChars))
      return cleanRich(value, 0)
    }
    case 'number':
    case 'range': {
      const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
      if (!Number.isFinite(n)) return undefined
      let out = n
      if (typeof field.min === 'number') out = Math.max(field.min, out)
      if (typeof field.max === 'number') out = Math.min(field.max, out)
      return out
    }
    case 'checkbox':
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'false') return value === 'true'
      return undefined
    case 'select': {
      const allowed = (field.options ?? []).map((option) => option.value)
      return typeof value === 'string' && allowed.includes(value) ? value : undefined
    }
    case 'color':
      return isSafeColor(value) ? value : undefined
    case 'link': {
      const url = typeof value === 'string' ? value : isPlain(value) && typeof value.url === 'string' ? value.url : undefined
      if (url === undefined) return undefined
      if (!isSafeUrl(url)) {
        warnings.add('A link that is not allowed (script or data address) was removed.')
        return undefined
      }
      const link: Record<string, unknown> = { url: url.trim() }
      if (isPlain(value)) {
        if (typeof value.newTab === 'boolean') link.newTab = value.newTab
        if (typeof value.nofollow === 'boolean') link.nofollow = value.nofollow
      }
      return link
    }
    case 'icon':
      return typeof value === 'string' && /^[a-z0-9 _-]{1,60}$/i.test(value) ? value : undefined
    case 'repeater': {
      if (!Array.isArray(value) || !field.repeater) return undefined
      return value
        .slice(0, BUILDER_LIMITS.maxRepeatItems)
        .map((item) => (isPlain(item) ? cleanProps(field.repeater!.fields, item, warnings, depth + 1) : undefined))
        .filter((item): item is Record<string, unknown> => item !== undefined)
    }
    case 'media': {
      // A placeholder the server swaps for a library picture (or removes). Ids and addresses from the model are never kept.
      if (isPlain(value) && typeof value.mediaQuery === 'string') {
        const mediaQuery = cleanText(value.mediaQuery, MEDIA_QUERY_MAX_CHARS).replace(/\s+/g, ' ').trim()
        if (!mediaQuery) return undefined
        const alt = typeof value.alt === 'string' ? cleanText(value.alt, MEDIA_ALT_MAX_CHARS).replace(/\s+/g, ' ').trim() : ''
        return { mediaQuery, alt }
      }
      warnings.add('Pictures and links to records are left for the admin to choose.')
      return undefined
    }
    default:
      // Pictures, file ids and record links are set by the admin, never by the model.
      warnings.add('Pictures and links to records are left for the admin to choose.')
      return undefined
  }
}

function cleanProps(fields: EditorField[], raw: Record<string, unknown>, warnings: Set<string>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const byName = new Map(fields.map((field) => [field.name, field]))
  const unknown: string[] = []
  for (const [name, value] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(name)) continue
    const field = byName.get(name)
    if (!field) {
      unknown.push(name)
      continue
    }
    const cleaned = cleanField(field, value, warnings, depth)
    if (cleaned !== undefined) out[name] = cleaned
    // A placeholder's alt text also fills the element's own alt field when it has one and the model left it empty.
    if (field.type === 'media' && isMediaPlaceholder(cleaned) && cleaned.alt) {
      const altName = [`${name}Alt`, 'alt'].find((candidate) => byName.has(candidate))
      if (altName && raw[altName] === undefined) out[altName] = cleaned.alt
    }
  }
  if (unknown.length > 0) warnings.add(`Settings the element does not have were removed (${unknown.slice(0, 5).join(', ')}).`)
  return out
}

type Counter = { nodes: number; warnings: Set<string> }

function countNode(counter: Counter): void {
  counter.nodes += 1
  if (counter.nodes > BUILDER_LIMITS.maxNodes) throw new BuilderError(`The reply has more than ${BUILDER_LIMITS.maxNodes} blocks. Ask for shorter sections.`)
}

const BUILDER_ELEMENT_TYPES = new Set(builderElements().map((def) => def.type))

function cleanElement(node: Record<string, unknown>, counter: Counter): SectionNode | null {
  const elementType = typeof node.elementType === 'string' ? node.elementType : ''
  const def: ElementDef | undefined = BUILDER_ELEMENT_TYPES.has(elementType) ? getElementDef(elementType) : undefined
  if (!def) {
    counter.warnings.add(`An element type the builder does not use was removed${elementType ? ` ("${cleanText(elementType, 40)}")` : ''}.`)
    return null
  }
  countNode(counter)
  const props = isPlain(node.props) ? cleanProps(def.fields, node.props, counter.warnings, 0) : {}
  const out: SectionNode = { blockType: 'element', elementType: def.type, props }
  const design = cleanDesign(node.design, false, counter.warnings)
  if (design) out.design = design
  return out
}

function cleanBlock(node: unknown, depth: number, counter: Counter): SectionNode | null {
  if (!isPlain(node)) {
    counter.warnings.add('An item that was not a block was removed.')
    return null
  }
  if (node.blockType === 'element') return cleanElement(node, counter)
  if (node.blockType === 'section') return cleanSection(node, depth, counter)
  counter.warnings.add('A block type the builder does not use was removed.')
  return null
}

function cleanColumn(raw: unknown, depth: number, counter: Counter): SectionColumn | null {
  if (!isPlain(raw)) return null
  const column: SectionColumn = { blocks: [] }
  if (typeof raw.width === 'number' && Number.isFinite(raw.width)) column.width = Math.min(12, Math.max(1, Math.round(raw.width))) as SectionColumn['width']
  if (typeof raw.label === 'string' && raw.label.trim()) column.label = cleanText(raw.label, 80)
  const design = cleanDesign(raw.design, false, counter.warnings)
  if (design) column.design = design
  const layout = parseColumnLayout(raw.layout)
  if (layout) column.layout = layout
  if (Array.isArray(raw.blocks)) {
    for (const child of raw.blocks) {
      const cleaned = cleanBlock(child, depth + 1, counter)
      if (cleaned) column.blocks!.push(cleaned)
    }
  }
  return column
}

function cleanSection(node: Record<string, unknown>, depth: number, counter: Counter): SectionNode | null {
  if (depth > BUILDER_LIMITS.maxDepth) throw new BuilderError('The reply nests sections too deeply.')
  countNode(counter)
  const out: SectionNode = { blockType: 'section', columns: [] }
  const design = cleanDesign(node.design, true, counter.warnings)
  if (design) out.design = design
  if (Array.isArray(node.columns)) {
    for (const raw of node.columns) {
      const column = cleanColumn(raw, depth, counter)
      if (column) out.columns!.push(column)
    }
  }
  return out
}

const makeId = (): string => globalThis.crypto.randomUUID()

/**
 * Validates the model's reply for one builder request. Returns sections with fresh ids,
 * or an error the admin can act on. Never throws.
 */
export function validateBuilderOutput(text: unknown, options: { mode: BuilderMode }): BuilderValidation {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The model returned nothing.' }
  if (text.length > BUILDER_LIMITS.maxReplyChars) return { ok: false, error: 'The model reply is too large.' }

  const data = extractJson(text)
  if (data === undefined) return { ok: false, error: 'The reply did not contain a JSON object.' }

  let tree: unknown
  if (Array.isArray(data)) {
    tree = data
  } else if (isPlain(data)) {
    if (data.format !== undefined && data.format !== 'engage-template') return { ok: false, error: 'The reply is not an engage-template document.' }
    if (data.schemaVersion !== undefined && data.schemaVersion !== 1) return { ok: false, error: 'The reply uses an unsupported schemaVersion.' }
    tree = data.tree
  }
  if (!Array.isArray(tree) || tree.length === 0) return { ok: false, error: 'The reply has no sections.' }

  const counter: Counter = { nodes: 0, warnings: new Set() }
  const sectionLimit = options.mode === 'page' ? BUILDER_LIMITS.maxSections : BUILDER_LIMITS.maxSectionsForSection
  try {
    const sections: SectionNode[] = []
    for (const item of tree) {
      if (!isPlain(item) || item.blockType !== 'section') {
        counter.warnings.add('Items at the top level that are not sections were removed.')
        continue
      }
      const section = cleanSection(item, 1, counter)
      if (section) sections.push(section)
    }
    if (sections.length === 0) return { ok: false, error: 'No usable section was found in the reply.' }
    if (sections.length > sectionLimit) {
      return { ok: false, error: `The reply has ${sections.length} sections. Return at most ${sectionLimit}.` }
    }
    return { ok: true, sections: withFreshIds(sections, makeId), warnings: Array.from(counter.warnings) }
  } catch (error) {
    if (error instanceof BuilderError) return { ok: false, error: error.message }
    return { ok: false, error: 'The reply could not be read as sections.' }
  }
}
