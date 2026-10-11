import { AdPlacements } from '@/features/ads/collections/AdPlacements'
import { AdUnits } from '@/features/ads/collections/AdUnits'
import { AdSettings } from '@/features/ads/settings'

import { generateTable } from './generate'

/** Tables for the ads collections and settings global, in their own file so the schema index is not edited. */
const unitsGenerated = generateTable(AdUnits)
export const adUnits = unitsGenerated.table
const placementsGenerated = generateTable(AdPlacements)
export const adPlacements = placementsGenerated.table
export const adSettingsGenerated = generateTable(AdSettings)
export const adSettings = adSettingsGenerated.table
