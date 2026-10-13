import type { Parcel } from './types'

export type PackagePreset = {
  name: string
  lengthCm: number
  widthCm: number
  heightCm: number
  /** Heaviest contents the box takes. */
  maxWeightKg: number
  /** Weight of the empty box. */
  tareKg: number
}

export type PackItem = {
  quantity: number
  weightKg?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
}

export const DEFAULT_PACKAGE: PackagePreset = { name: 'Medium box', lengthCm: 30, widthCm: 25, heightCm: 15, maxWeightKg: 5, tareKg: 0.2 }

const pos = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback)

/** Reads the package presets list from settings (a JSON array), dropping rows that are not usable. */
export function normalisePresets(raw: unknown): PackagePreset[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      list = []
    }
  }
  if (!Array.isArray(list)) return []
  const out: PackagePreset[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const p: PackagePreset = {
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : 'Box',
      lengthCm: pos(r.lengthCm, 0),
      widthCm: pos(r.widthCm, 0),
      heightCm: pos(r.heightCm, 0),
      maxWeightKg: pos(r.maxWeightKg, 0),
      tareKg: typeof r.tareKg === 'number' && r.tareKg >= 0 ? r.tareKg : 0,
    }
    if (p.lengthCm && p.widthCm && p.heightCm && p.maxWeightKg) out.push(p)
  }
  return out.slice(0, 20)
}

const volume = (p: { lengthCm: number; widthCm: number; heightCm: number }): number => p.lengthCm * p.widthCm * p.heightCm

/**
 * Turns cart items into parcels. Picks the smallest preset box that holds everything by weight and
 * volume; if nothing fits, fills the largest preset one box at a time. Items with no weight count as
 * 100 g so a cart is never "weightless". A cart with no presets becomes one parcel sized to the
 * default box. Pure and deterministic.
 */
export function packItems(items: PackItem[], presets: PackagePreset[]): Parcel[] {
  const units: { weight: number; vol: number }[] = []
  for (const item of items) {
    const q = Math.max(0, Math.floor(item.quantity))
    for (let i = 0; i < q && units.length < 500; i += 1) {
      const dimsKnown = item.lengthCm && item.widthCm && item.heightCm
      units.push({ weight: pos(item.weightKg, 0.1), vol: dimsKnown ? (item.lengthCm as number) * (item.widthCm as number) * (item.heightCm as number) : 0 })
    }
  }
  if (units.length === 0) return []
  const usable = presets.length > 0 ? presets : [DEFAULT_PACKAGE]
  const totalWeight = units.reduce((s, u) => s + u.weight, 0)
  const totalVolume = units.reduce((s, u) => s + u.vol, 0)
  const bySize = [...usable].sort((a, b) => volume(a) - volume(b))
  // 85% fill: boxes are never packed perfectly.
  const single = bySize.find((p) => totalWeight <= p.maxWeightKg && totalVolume <= volume(p) * 0.85)
  const toParcel = (p: PackagePreset, weight: number): Parcel => ({
    weightKg: Math.round((weight + p.tareKg) * 1000) / 1000,
    lengthCm: p.lengthCm,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
  })
  if (single) return [toParcel(single, totalWeight)]
  const biggest = bySize[bySize.length - 1]
  const parcels: Parcel[] = []
  let w = 0
  let v = 0
  for (const u of units) {
    const wouldOverflow = w > 0 && (w + u.weight > biggest.maxWeightKg || v + u.vol > volume(biggest) * 0.85)
    if (wouldOverflow) {
      parcels.push(toParcel(biggest, w))
      w = 0
      v = 0
    }
    w += u.weight
    v += u.vol
  }
  if (w > 0) parcels.push(toParcel(biggest, w))
  return parcels
}

/** Carrier "cubic weight" in kg (length x width x height cm / 4000, the Australian domestic divisor). */
export const cubicWeightKg = (p: Parcel): number => Math.round(((p.lengthCm * p.widthCm * p.heightCm) / 4000) * 1000) / 1000
