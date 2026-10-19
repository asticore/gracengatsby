import { getElementDef } from './registry'

/** Text for the editor placeholder shown when an element's type is not in this editor's registry. */
export const UNKNOWN_ELEMENT_DETAIL = 'Kept in the page data, not shown on the live page. It will not be lost when you save.'

export const unknownElementTitle = (type: unknown): string =>
  `Unknown element type "${typeof type === 'string' && type ? type.slice(0, 80) : '(no type)'}"`

/** True when the element type is missing from the registry: drawn as a marked placeholder in the editor and as nothing on the live page. */
export const isUnknownElementType = (type: unknown): boolean => typeof type !== 'string' || !type || !getElementDef(type)
