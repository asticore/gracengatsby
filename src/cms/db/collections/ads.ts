import { AdPlacements } from '@/features/ads/collections/AdPlacements'
import { AdUnits } from '@/features/ads/collections/AdUnits'
import { AdSettings } from '@/features/ads/settings'

import { createCollectionOps, createGlobalOps } from '../generic'
import { adPlacements, adSettings, adSettingsGenerated, adUnits } from '../schema/ads'

type Doc = Record<string, unknown> & { id: number; updatedAt: string; createdAt: string }
type Paged = (args?: { where?: import('@/engine').Where; sort?: import('@/engine').Sort; limit?: number; page?: number; pagination?: boolean }) => Promise<any>

const unitOps = createCollectionOps(adUnits, AdUnits)
export const findAdUnitsPaginated = unitOps.findPaginated as unknown as Paged
export const findAdUnitByID = unitOps.findByID as unknown as (id: number) => Promise<Doc | null>
export const countAdUnits = unitOps.count
export const createAdUnit = unitOps.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateAdUnit = unitOps.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteAdUnit = unitOps.deleteByID

const placementOps = createCollectionOps(adPlacements, AdPlacements)
export const findAdPlacementsPaginated = placementOps.findPaginated as unknown as Paged
export const findAdPlacementByID = placementOps.findByID as unknown as (id: number) => Promise<Doc | null>
export const countAdPlacements = placementOps.count
export const createAdPlacement = placementOps.create as unknown as (data: Record<string, unknown>) => Promise<Doc>
export const updateAdPlacement = placementOps.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<Doc | null>
export const deleteAdPlacement = placementOps.deleteByID

const settingsOps = createGlobalOps(adSettings, AdSettings, {}, { groupFields: adSettingsGenerated.groupFields })
export const findAdSettings = settingsOps.find as unknown as () => Promise<Doc | null>
export const updateAdSettings = settingsOps.update as unknown as (data: Record<string, unknown>) => Promise<Doc>
