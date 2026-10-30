/*
 * Reads a tracking-event request body (create or edit) into a definition, and validates it. Pure: the routes call
 * it after the admin check, and the tests call it directly. Only the known fields are read; anything else is ignored.
 */
import { STANDARD_EVENTS, TRIGGER_TYPES, URL_MATCH_MODES, validateTrackingEvent, type TrackingEventDef } from './events'
import { normaliseRulePath } from './urlRule'

export const TRACKING_EVENT_FIELDS = [
  'name',
  'platformEvent',
  'triggerType',
  'selector',
  'selectorText',
  'urlMatchMode',
  'urlMatch',
  'domain',
  'scrollDepth',
  'timeSeconds',
  'value',
  'currency',
  'contentName',
  'enabled',
] as const

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/**
 * The definition a body describes, with `base` filling every field the body leaves out (an edit keeps what it does
 * not change). For a create, `base` is empty and the defaults apply.
 */
export function readTrackingEventBody(body: Record<string, unknown>, base: Partial<TrackingEventDef> = {}): { def: TrackingEventDef; errors: string[] } {
  // A field the body sends is read; a field it leaves out keeps the base value (an edit) or the default (a create).
  const field = <V,>(key: keyof TrackingEventDef, read: (value: unknown) => V | null): V | null | undefined =>
    key in body ? read(body[key]) : (base[key] as V | null | undefined)
  const def: TrackingEventDef = {
    name: field('name', text) ?? '',
    platformEvent: (field('platformEvent', text) ?? 'Custom') as TrackingEventDef['platformEvent'],
    triggerType: (field('triggerType', text) ?? 'click') as TrackingEventDef['triggerType'],
    selector: field('selector', text) ?? null,
    selectorText: field('selectorText', text) ?? null,
    urlMatchMode: (field('urlMatchMode', text) ?? 'any') as TrackingEventDef['urlMatchMode'],
    urlMatch: field('urlMatch', text) ?? null,
    domain: field('domain', text) ?? null,
    scrollDepth: field('scrollDepth', number) ?? null,
    timeSeconds: field('timeSeconds', number) ?? null,
    value: field('value', number) ?? null,
    currency: field('currency', text) ?? null,
    contentName: field('contentName', text) ?? null,
    enabled: 'enabled' in body ? body.enabled !== false : base.enabled !== false,
  }
  // A rule is stored in its canonical form, so "/fr/shop/" and "/shop" are the same rule.
  if (def.urlMatchMode && def.urlMatchMode !== 'any' && def.urlMatch) {
    def.urlMatch = def.urlMatchMode === 'contains' ? def.urlMatch : normaliseRulePath(def.urlMatch)
  }
  const errors = validateTrackingEvent(def)
  if (!STANDARD_EVENTS.includes(def.platformEvent)) errors.push('Unknown standard event.')
  if (!TRIGGER_TYPES.includes(def.triggerType)) errors.push('Unknown trigger.')
  if (!URL_MATCH_MODES.includes(def.urlMatchMode as never)) errors.push('Unknown URL match.')
  return { def, errors }
}

/** The fields the admin editor reads back from a stored row, as a plain object for the list endpoint. */
export function trackingEventSummary(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name ?? '',
    platformEvent: row.platformEvent ?? 'Custom',
    triggerType: row.triggerType ?? 'click',
    selector: row.selector ?? null,
    urlMatchMode: row.urlMatchMode ?? 'any',
    urlMatch: row.urlMatch ?? null,
    value: row.value ?? null,
    currency: row.currency ?? null,
    enabled: row.enabled !== false,
  }
}
