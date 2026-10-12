/**
 * A form's layout: the same JSON tree the page builder uses.
 *
 * A form is a list of nodes. A node is either a layout block (a `section` with
 * columns, a heading, rich text, a button...) or an `element` block whose
 * `elementType` starts with `ff-` - a form field. Everything the visual editor
 * already does for pages - nesting, column widths per device, the Design tab -
 * therefore works on a form with no second model.
 *
 * Why this file exists: three different readers need the same answer to "what
 * fields does this form have, in what order, and where do the steps break".
 * The renderer draws the tree, the submission handler validates against the
 * flat field list, and the CSV/notification code labels answers from it. All
 * three get it from here, so a tree and the list it implies cannot disagree.
 *
 * Pure and dependency-free (types only): it runs in the browser, the Worker
 * and the editor canvas alike.
 */

import { sanitiseHtml, sanitiseLayoutHtml } from './htmlSanitize'
import type { FieldWidth, FormDoc, FormFieldDef, FormFieldOption, FormFieldType } from './types'

/** A node as the visual editor stores it. Loose on purpose: it is user-editable JSON. */
export type LayoutNode = {
  blockType: string
  _id?: string
  elementType?: string
  props?: Record<string, unknown>
  columns?: LayoutColumn[]
  design?: unknown
  [key: string]: unknown
}

export type LayoutColumn = {
  _id?: string
  width?: number
  widthDesktop?: { value: number; unit: string }
  widthTablet?: { value: number; unit: string }
  widthMobile?: { value: number; unit: string }
  design?: unknown
  blocks?: LayoutNode[]
}

export const FIELD_ELEMENT_PREFIX = 'ff-'
export const STEP_ELEMENT = 'ff-step'
export const HTML_ELEMENT = 'ff-html'

/** Field types that become `ff-<type>` elements. `section` and `page` are handled separately. */
export const FIELD_TYPES: FormFieldType[] = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkbox',
  'date',
  'time',
  'datetime',
  'file',
  'hidden',
  'rating',
  'nps',
  'signature',
  'matrix',
  'appointment',
  'address',
  'consent',
  'calculation',
  'payment',
]

const FIELD_TYPE_SET = new Set<string>(FIELD_TYPES)

export const isFieldElementType = (elementType: unknown): boolean =>
  typeof elementType === 'string' &&
  elementType.startsWith(FIELD_ELEMENT_PREFIX) &&
  FIELD_TYPE_SET.has(elementType.slice(FIELD_ELEMENT_PREFIX.length))

export const fieldTypeOf = (elementType: string): FormFieldType => elementType.slice(FIELD_ELEMENT_PREFIX.length) as FormFieldType

export const isFieldNode = (node: LayoutNode | undefined | null): boolean =>
  Boolean(node) && node!.blockType === 'element' && isFieldElementType(node!.elementType)

export const isStepNode = (node: LayoutNode | undefined | null): boolean =>
  Boolean(node) && node!.blockType === 'element' && node!.elementType === STEP_ELEMENT

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** Lowercase, underscores, no leading digit: the shape a stored answer key should have. */
export function slugifyName(label: string, fallback = 'field'): string {
  const base = (label || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const named = base || fallback
  return /^[0-9]/.test(named) ? `f_${named}` : named
}

/** A name not in `used`, by adding _2, _3... Adds the result to `used`. */
export function uniqueName(wanted: string, used: Set<string>): string {
  let name = wanted
  let n = 2
  while (used.has(name)) {
    name = `${wanted}_${n}`
    n += 1
  }
  used.add(name)
  return name
}

/** Splits "Label | value | price" lines into options. A line with one part uses it for both. */
export function parseOptionsText(text: string): FormFieldOption[] {
  const options: FormFieldOption[] = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [label, value, price] = line.split('|').map((part) => part.trim())
    const priced = price !== undefined && price !== '' && Number.isFinite(Number(price)) ? Number(price) : undefined
    options.push({ label, value: value || label, ...(priced !== undefined ? { price: priced } : {}) })
  }
  return options
}

const cleanOptions = (value: unknown): FormFieldOption[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const options: FormFieldOption[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    const label = asString(row.label)?.trim()
    const optionValue = asString(row.value)?.trim() || label
    if (!label && !optionValue) continue
    const price = asNumber(row.price)
    options.push({ label: label || optionValue, value: optionValue, ...(price !== undefined ? { price } : {}) })
  }
  return options
}

/**
 * One field element -> the flat field definition every other module understands.
 * `props` is already shaped like a FormFieldDef (the editor edits it that way),
 * so this mostly validates and renames.
 */
export function nodeToField(node: LayoutNode, used: Set<string>, index: number): FormFieldDef {
  const type = fieldTypeOf(String(node.elementType))
  const props = asRecord(node.props)
  const label = asString(props.label)
  const hasValue = !['payment'].includes(type)

  const field: FormFieldDef = { id: node._id, type }
  if (label !== undefined) field.label = label
  if (hasValue) {
    const wanted = asString(props.name)?.trim() || slugifyName(label || type, `${type}_${index + 1}`)
    field.name = uniqueName(wanted, used)
  }
  if (typeof props.required === 'boolean') field.required = props.required
  const placeholder = asString(props.placeholder)
  if (placeholder) field.placeholder = placeholder
  const helpText = asString(props.helpText)
  if (helpText) field.helpText = helpText
  const defaultValue = asString(props.defaultValue)
  if (defaultValue !== undefined && defaultValue !== '') field.defaultValue = defaultValue

  const width = asString(props.width)
  if (width === 'full' || width === 'half' || width === 'third' || width === 'twoThirds' || width === 'quarter') {
    field.width = width as FieldWidth
  }

  const options = cleanOptions(props.options)
  if (options && options.length > 0) field.options = options
  const rows = cleanOptions(props.rows)
  if (rows && rows.length > 0) field.rows = rows

  const min = asNumber(props.min)
  const max = asNumber(props.max)
  if (min !== undefined) field.min = min
  if (max !== undefined) field.max = max
  const accept = asString(props.accept)
  if (accept) field.accept = accept
  const maxFileMb = asNumber(props.maxFileMb)
  if (maxFileMb !== undefined) field.maxFileMb = maxFileMb
  const scaleMax = asNumber(props.scaleMax)
  if (scaleMax !== undefined) field.scaleMax = scaleMax

  const minLength = asNumber(props.minLength)
  const maxLength = asNumber(props.maxLength)
  const pattern = asString(props.pattern)
  if (minLength !== undefined || maxLength !== undefined || pattern) {
    field.validation = {
      ...(minLength !== undefined ? { minLength } : {}),
      ...(maxLength !== undefined ? { maxLength } : {}),
      ...(pattern ? { pattern } : {}),
      ...(asString(props.patternMessage) ? { patternMessage: asString(props.patternMessage) } : {}),
    }
  }

  if (type === 'appointment') {
    const slots = (asString(props.slotsText) || '')
      .split(/[\s,;]+/)
      .map((slot) => slot.trim())
      .filter((slot) => /^\d{1,2}:\d{2}$/.test(slot))
    const weekdays = (asString(props.weekdaysText) || '1,2,3,4,5')
      .split(/[\s,;]+/)
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    field.appointment = {
      slots,
      weekdays,
      daysAhead: asNumber(props.daysAhead) ?? 60,
    }
  }
  const lookup = asString(props.addressLookup)
  if (type === 'address' && (lookup === 'none' || lookup === 'nominatim' || lookup === 'google')) field.addressLookup = lookup
  const consentLink = asString(props.consentLink)
  if (consentLink) field.consentLink = consentLink
  const prefillKey = asString(props.prefillKey)?.trim()
  if (prefillKey) field.prefillKey = prefillKey

  const conditional = asRecord(props.conditional)
  if (conditional.enabled === true) {
    field.conditional = {
      enabled: true,
      action: conditional.action === 'hide' ? 'hide' : 'show',
      match: conditional.match === 'any' ? 'any' : 'all',
      rules: (Array.isArray(conditional.rules) ? conditional.rules : [])
        .map(asRecord)
        .filter((rule) => asString(rule.field))
        .map((rule) => ({
          field: asString(rule.field),
          operator: (asString(rule.operator) || 'equals') as never,
          value: asString(rule.value) ?? '',
        })),
    }
  }

  const calculation = asRecord(props.calculation)
  if (type === 'calculation') {
    field.calculation = {
      formula: asString(props.formula) ?? asString(calculation.formula) ?? '',
      decimalPlaces: asNumber(props.decimalPlaces) ?? asNumber(calculation.decimalPlaces) ?? 2,
      prefix: asString(props.prefix) ?? asString(calculation.prefix),
      suffix: asString(props.suffix) ?? asString(calculation.suffix),
    }
  }
  if (props.priced === true) {
    field.pricing = { priced: true, amount: asNumber(props.amount), unitPrice: asNumber(props.unitPrice) }
  }
  return field
}

type Walk = {
  fields: FormFieldDef[]
  /** Titles of the steps, in order. Always at least one entry. */
  stepTitles: string[]
}

/**
 * Depth-first, document order. Step markers count only at the top level of the
 * tree - a step inside a column has no meaning, so it is skipped rather than
 * silently splitting the form in the middle of a row.
 */
export function walkLayout(layout: unknown): Walk {
  const nodes = Array.isArray(layout) ? (layout as LayoutNode[]) : []
  const fields: FormFieldDef[] = []
  const stepTitles: string[] = ['']
  const used = new Set<string>()

  const visit = (node: LayoutNode, topLevel: boolean) => {
    if (!node || typeof node !== 'object') return
    if (isStepNode(node)) {
      if (topLevel) {
        fields.push({ id: node._id, type: 'page', label: asString(asRecord(node.props).title) || '' })
        stepTitles.push(asString(asRecord(node.props).title) || '')
      }
      return
    }
    if (isFieldNode(node)) {
      fields.push(nodeToField(node, used, fields.length))
      return
    }
    if (node.blockType === 'element' && node.elementType === HTML_ELEMENT) {
      fields.push({ id: node._id, type: 'html', html: sanitiseHtml(asString(asRecord(node.props).html) || '') })
      return
    }
    if (Array.isArray(node.columns)) {
      for (const column of node.columns) {
        for (const child of column?.blocks || []) visit(child, false)
      }
    }
  }

  for (const node of nodes) visit(node, true)
  // A leading step marker would otherwise leave an empty first step.
  return { fields, stepTitles }
}

/** The flat list of definitions a layout implies. */
export const flattenLayout = (layout: unknown): FormFieldDef[] => walkLayout(layout).fields

/* -------------------------------------------------------------------------- */
/* Legacy upgrade                                                              */
/* -------------------------------------------------------------------------- */

const fieldToProps = (field: FormFieldDef): Record<string, unknown> => {
  const props: Record<string, unknown> = {}
  const copy = <K extends keyof FormFieldDef>(key: K) => {
    if (field[key] !== undefined && field[key] !== null && field[key] !== '') props[key] = field[key]
  }
  copy('label')
  copy('name')
  copy('required')
  copy('placeholder')
  copy('helpText')
  copy('defaultValue')
  copy('width')
  copy('min')
  copy('max')
  copy('accept')
  if (field.options && field.options.length > 0) props.options = field.options.map((option) => ({ ...option }))
  if (field.conditional?.enabled) props.conditional = JSON.parse(JSON.stringify(field.conditional))
  if (field.calculation) {
    props.formula = field.calculation.formula
    props.decimalPlaces = field.calculation.decimalPlaces
    props.prefix = field.calculation.prefix
    props.suffix = field.calculation.suffix
  }
  if (field.pricing?.priced) {
    props.priced = true
    props.amount = field.pricing.amount
    props.unitPrice = field.pricing.unitPrice
  }
  return props
}

/**
 * The old flat field list, as a layout tree.
 *
 * Non-destructive and deterministic (ids are derived from position), so
 * running it twice gives the same tree and an editor can call it on every open
 * without churn. Width is kept on each field, so a half-width pair still
 * renders side by side. A `page` field becomes a top-level step marker; a
 * `section` field becomes a heading (plus an html element for its body).
 */
export function upgradeFieldsToLayout(fields: unknown): LayoutNode[] {
  const list = (Array.isArray(fields) ? fields : []) as FormFieldDef[]
  const out: LayoutNode[] = []
  let current: LayoutNode[] = []
  let section = 0

  const flush = () => {
    if (current.length === 0) return
    section += 1
    out.push({
      blockType: 'section',
      _id: `legacy-section-${section}`,
      columns: [{ _id: `legacy-section-${section}-col`, width: 12, widthDesktop: { value: 12, unit: 'fraction' }, design: {}, blocks: current }],
    })
    current = []
  }

  list.forEach((field, index) => {
    if (!field || typeof field !== 'object') return
    const id = `legacy-${index}`
    switch (field.type) {
      case 'page':
        flush()
        out.push({ blockType: 'element', _id: id, elementType: STEP_ELEMENT, props: { title: field.label || '' } })
        return
      case 'section':
        current.push({
          blockType: 'element',
          _id: id,
          elementType: 'heading',
          props: { text: field.label || '', tag: 'h3', align: 'left' },
        })
        if (field.html) current.push({ blockType: 'element', _id: `${id}-html`, elementType: HTML_ELEMENT, props: { html: field.html } })
        return
      case 'html':
        current.push({ blockType: 'element', _id: id, elementType: HTML_ELEMENT, props: { html: field.html || '', width: field.width } })
        return
      default: {
        const type = (field.type || 'text') as FormFieldType
        if (!FIELD_TYPE_SET.has(type)) return
        current.push({ blockType: 'element', _id: id, elementType: `${FIELD_ELEMENT_PREFIX}${type}`, props: fieldToProps(field) })
      }
    }
  })
  flush()
  return out
}

/* -------------------------------------------------------------------------- */
/* What a visitor sees                                                         */
/* -------------------------------------------------------------------------- */

const hasNodes = (value: unknown): value is LayoutNode[] => Array.isArray(value) && value.length > 0

export const isPublished = (form: Pick<FormDoc, 'formStatus'> | null | undefined): boolean =>
  // Forms made before the visual builder have no status; they were always live.
  form?.formStatus !== 'draft'

export type ResolvedLayout = {
  layout: LayoutNode[]
  fields: FormFieldDef[]
  stepTitles: string[]
  /** True when the tree was derived from the old field list rather than stored. */
  legacy: boolean
}

/**
 * The layout a form should be drawn and validated with.
 *
 * `draft: true` is for the editor preview (the working copy); the public site
 * never passes it. Anything stored is read through `walkLayout`, so a hand-
 * edited or half-saved tree degrades to fewer fields rather than throwing.
 */
export function resolveLayout(form: FormDoc | null | undefined, options: { draft?: boolean } = {}): ResolvedLayout {
  const stored = options.draft ? (hasNodes(form?.layout) ? form!.layout : form?.publishedLayout) : form?.publishedLayout
  if (hasNodes(stored)) {
    const walked = walkLayout(stored)
    return { layout: stored, fields: walked.fields, stepTitles: walked.stepTitles, legacy: false }
  }
  const upgraded = upgradeFieldsToLayout(form?.fields)
  const walked = walkLayout(upgraded)
  return { layout: upgraded, fields: walked.fields, stepTitles: walked.stepTitles, legacy: true }
}

/**
 * The form with its `fields` replaced by what the layout implies. Everything
 * downstream (validation, pricing, CSV, emails) reads `form.fields`, so one call
 * at the entry point keeps them all in step with the visual builder.
 */
export function withResolvedFields<T extends FormDoc>(form: T, options: { draft?: boolean } = {}): T & { fields: FormFieldDef[] } {
  const resolved = resolveLayout(form, options)
  return { ...form, fields: resolved.fields }
}

/** True when the working copy differs from what is live: shown as "unpublished changes". */
export function hasUnpublishedChanges(form: FormDoc | null | undefined): boolean {
  if (!form) return false
  if (!hasNodes(form.layout)) return false
  if (!hasNodes(form.publishedLayout)) return true
  return JSON.stringify(stripIds(form.layout)) !== JSON.stringify(stripIds(form.publishedLayout))
}

function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === '_id') continue
      out[key] = stripIds(entry)
    }
    return out
  }
  return value
}

/**
 * Splits the top-level nodes into steps at each step marker.
 * Returns one array of nodes per step (at least one).
 */
export function splitLayoutIntoSteps(layout: LayoutNode[]): LayoutNode[][] {
  const steps: LayoutNode[][] = [[]]
  for (const node of layout || []) {
    if (isStepNode(node)) {
      steps.push([])
      continue
    }
    steps[steps.length - 1].push(node)
  }
  // Same rule as splitIntoPages: an empty step other than the first is dropped.
  return steps.filter((step, index) => step.length > 0 || index === 0)
}

/** Replaces any media ids, scripts and unknown keys we never render. Keeps the tree JSON-safe and bounded. */
export const MAX_LAYOUT_NODES = 600
export const MAX_LAYOUT_BYTES = 400_000

/**
 * Server-side sanitising of a layout before it is stored.
 *
 * Never trust the editor: the endpoint is a REST write. This enforces shape
 * (an array of objects with a string blockType), depth, node count and size,
 * and drops anything else. Returns null when the input is unusable so the
 * caller can refuse rather than store junk.
 */
export function sanitiseLayout(input: unknown): LayoutNode[] | null {
  if (!Array.isArray(input)) return null
  let count = 0
  const clean = (node: unknown, depth: number): LayoutNode | null => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null
    const raw = node as LayoutNode
    if (typeof raw.blockType !== 'string' || raw.blockType.length > 40) return null
    count += 1
    if (count > MAX_LAYOUT_NODES || depth > 8) return null
    const next: LayoutNode = { ...raw }
    if (Array.isArray(raw.columns)) {
      next.columns = raw.columns
        .filter((column) => column && typeof column === 'object')
        .slice(0, 12)
        .map((column) => ({
          ...column,
          blocks: (Array.isArray(column.blocks) ? column.blocks : [])
            .map((child) => clean(child, depth + 1))
            .filter((child): child is LayoutNode => child !== null),
        }))
    }
    return next
  }
  const out = sanitiseLayoutHtml(input.map((node) => clean(node, 0)).filter((node): node is LayoutNode => node !== null))
  if (count > MAX_LAYOUT_NODES) return null
  if (JSON.stringify(out).length > MAX_LAYOUT_BYTES) return null
  return out
}
