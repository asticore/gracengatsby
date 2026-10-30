import { validateTrackingEvent, type StandardEvent, type TrackingEventDef, type TriggerType, type UrlMatchMode } from './events'

/** What the browser needs for one event. No internal fields, no ids beyond the event's own name. */
export type PublicTrackingEvent = Omit<TrackingEventDef, 'platformEvent' | 'triggerType' | 'urlMatchMode' | 'enabled'> & {
  platformEvent: StandardEvent
  triggerType: TriggerType
  urlMatchMode: UrlMatchMode
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Turns a stored row into the public shape, dropping any row the validator rejects. */
export function toPublicEvent(row: Record<string, unknown>): PublicTrackingEvent | null {
  const def: TrackingEventDef = {
    name: str(row.name) ?? '',
    platformEvent: (str(row.platformEvent) ?? 'Custom') as StandardEvent,
    triggerType: (str(row.triggerType) ?? 'click') as TriggerType,
    selector: str(row.selector),
    selectorText: str(row.selectorText),
    urlMatchMode: (str(row.urlMatchMode) ?? 'any') as UrlMatchMode,
    urlMatch: str(row.urlMatch),
    domain: str(row.domain),
    scrollDepth: num(row.scrollDepth),
    timeSeconds: num(row.timeSeconds),
    value: num(row.value),
    currency: str(row.currency),
    contentName: str(row.contentName),
    enabled: row.enabled !== false,
  }
  if (!def.enabled || validateTrackingEvent(def).length) return null
  return {
    name: def.name,
    platformEvent: def.platformEvent,
    triggerType: def.triggerType,
    selector: def.selector,
    selectorText: def.selectorText,
    urlMatchMode: def.urlMatchMode ?? 'any',
    urlMatch: def.urlMatch,
    domain: def.domain,
    scrollDepth: def.scrollDepth,
    timeSeconds: def.timeSeconds,
    value: def.value,
    currency: def.currency,
    contentName: def.contentName,
  }
}
