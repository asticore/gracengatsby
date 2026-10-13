/**
 * Pure parser: Google Places `address_components` -> the address sub-fields the
 * form uses (the same five the OpenStreetMap path fills).
 *
 * Spec (Google type -> form field):
 * - street: `street_number` + `route`, joined with a space ("12 Main St").
 *   With neither, the first comma-separated part of `formatted_address` is used.
 * - city (the "suburb" in the brief): `locality`, then `postal_town`, then
 *   `sublocality_level_1`, then `sublocality`, then `administrative_area_level_2`. Empty when none is present.
 * - region (state): `administrative_area_level_1`, long name.
 * - postcode: `postal_code`.
 * - country: `country`, long name.
 * Missing parts come back as ''. Anything that is not an object is ignored, so a
 * malformed response never throws.
 */

export type PlaceComponent = { long_name?: unknown; short_name?: unknown; types?: unknown }

export type PlaceAddress = {
  line1: string
  city: string
  region: string
  postcode: string
  country: string
}

const pick = (components: PlaceComponent[], type: string): string => {
  const hit = components.find((component) => Array.isArray(component.types) && component.types.includes(type))
  return typeof hit?.long_name === 'string' ? hit.long_name.trim() : ''
}

const firstOf = (components: PlaceComponent[], types: string[]): string => {
  for (const type of types) {
    const value = pick(components, type)
    if (value) return value
  }
  return ''
}

export function parsePlaceAddress(components: unknown, formatted?: unknown): PlaceAddress {
  const list = (Array.isArray(components) ? components : []).filter(
    (entry): entry is PlaceComponent => Boolean(entry) && typeof entry === 'object',
  )
  const number = pick(list, 'street_number')
  const route = pick(list, 'route')
  const fromFormatted = typeof formatted === 'string' ? formatted.split(',')[0].trim() : ''
  return {
    line1: [number, route].filter(Boolean).join(' ') || fromFormatted,
    city: firstOf(list, ['locality', 'postal_town', 'sublocality_level_1', 'sublocality', 'administrative_area_level_2']),
    region: pick(list, 'administrative_area_level_1'),
    postcode: pick(list, 'postal_code'),
    country: pick(list, 'country'),
  }
}
