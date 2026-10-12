/**
 * Measurement units. The shop STORES metric (kilograms, centimetres) everywhere: product fields,
 * orders, carrier requests. The unit setting (Shop settings > General) only changes the labels and
 * converts what is shown and typed in the admin and on the storefront.
 */

export type UnitSystem = 'metric' | 'imperial'

export const KG_PER_LB = 0.45359237
export const CM_PER_IN = 2.54

export function normaliseUnitSystem(value: unknown): UnitSystem {
  return value === 'imperial' ? 'imperial' : 'metric'
}

export const weightUnit = (system: UnitSystem): 'kg' | 'lb' => (system === 'imperial' ? 'lb' : 'kg')
export const lengthUnit = (system: UnitSystem): 'cm' | 'in' => (system === 'imperial' ? 'in' : 'cm')

const round = (n: number, places: number): number => {
  const f = 10 ** places
  return Math.round((n + Number.EPSILON) * f) / f
}

/** Canonical kilograms to the number shown in the chosen system. */
export function kgToDisplay(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? round(kg / KG_PER_LB, 3) : round(kg, 3)
}

/** A number typed in the chosen system back to canonical kilograms. */
export function displayToKg(value: number, system: UnitSystem): number {
  return round(system === 'imperial' ? value * KG_PER_LB : value, 4)
}

export function cmToDisplay(cm: number, system: UnitSystem): number {
  return system === 'imperial' ? round(cm / CM_PER_IN, 2) : round(cm, 2)
}

export function displayToCm(value: number, system: UnitSystem): number {
  return round(system === 'imperial' ? value * CM_PER_IN : value, 3)
}

export function formatWeight(kg: number | null | undefined, system: UnitSystem): string {
  if (typeof kg !== 'number' || !Number.isFinite(kg)) return ''
  return `${kgToDisplay(kg, system)} ${weightUnit(system)}`
}

export function formatDimensions(dims: { length?: number | null; width?: number | null; height?: number | null }, system: UnitSystem): string {
  const parts = [dims.length, dims.width, dims.height]
  if (parts.some((p) => typeof p !== 'number' || !Number.isFinite(p))) return ''
  return `${parts.map((p) => cmToDisplay(p as number, system)).join(' x ')} ${lengthUnit(system)}`
}

/** Tooltip text for a unit-bearing setting. */
export function unitHelp(kind: 'weight' | 'dimension', system: UnitSystem): string {
  if (kind === 'weight') {
    return system === 'imperial'
      ? 'Pounds (lb). Stored internally as kilograms (1 lb = 0.4536 kg), so carriers and shipping rates always get metric.'
      : 'Kilograms (kg). Carriers and weight-based shipping rates use kilograms.'
  }
  return system === 'imperial'
    ? 'Inches (in). Stored internally as centimetres (1 in = 2.54 cm), so carriers always get metric.'
    : 'Centimetres (cm). Carriers use centimetres for parcel size.'
}
