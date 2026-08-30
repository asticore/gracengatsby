/**
 * The read-only half of the tool: what each feature owns and what it costs.
 *
 * Nothing here writes. The admin screen renders straight off this, and the
 * cleanup planner builds on the same result, so what an operator is shown and
 * what would actually be dropped cannot drift apart.
 */

import { FEATURES, type FeatureKey } from '@/features/registry'
import type { FeatureFlags } from '@/features/registry'

import type { CleanupDb } from './db'
import { SHARED_OWNER, assignTables, resolveParents, type OwnedTable } from './tables'
import { surveySizes, type SizeReport } from './size'

export type SurveyTable = {
  table: string
  rows: number
  bytes: number
  /** Other switched-on features that also claim this table, if any. */
  alsoClaimedBy: FeatureKey[]
}

export type FeatureSurvey = {
  key: FeatureKey
  label: string
  enabled: boolean
  implemented: boolean
  tables: SurveyTable[]
  totalRows: number
  totalBytes: number
  /** True when there is something a cleanup could actually remove. */
  reclaimable: boolean
}

export type DatabaseSurvey = {
  features: FeatureSurvey[]
  /** Tables no feature claims - shared content and engine bookkeeping. */
  unclaimedTables: string[]
  sizesAreExact: boolean
  sizeNote: string
  databaseBytes: number | null
  /** Indexes still named after a table's pre-rename name. */
  staleIndexCount: number
}

/**
 * Which tables a single feature would lose, with every co-claim recorded.
 * Shared parents are excluded outright: a feature is never the owner of
 * `eg_pages` even if it says it is.
 */
export function tablesForFeature(key: FeatureKey, owned: OwnedTable[]): OwnedTable[] {
  return owned.filter((entry) => entry.owners.includes(key) && !entry.owners.includes(SHARED_OWNER))
}

export async function surveyDatabase(
  db: CleanupDb,
  flags: FeatureFlags,
  staleIndexCount = 0,
): Promise<DatabaseSurvey> {
  const tables = await db.listTables()
  const parents = resolveParents(tables)
  const owned = assignTables(tables, parents)

  // Sizing every table in the database would double the work for no gain -
  // only what a feature could lose is ever shown against a feature.
  const sized: SizeReport = await surveySizes(
    db,
    owned.map((entry) => entry.table),
  )

  const features: FeatureSurvey[] = FEATURES.map((feature) => {
    const mine = tablesForFeature(feature.key, owned)

    const rows: SurveyTable[] = mine.map((entry) => {
      const size = sized.sizes.get(entry.table)
      return {
        table: entry.table,
        rows: size?.rows ?? 0,
        bytes: size?.bytes ?? 0,
        alsoClaimedBy: entry.owners.filter(
          (owner): owner is FeatureKey => owner !== SHARED_OWNER && owner !== feature.key,
        ),
      }
    })

    const totalRows = rows.reduce((sum, entry) => sum + entry.rows, 0)
    const totalBytes = rows.reduce((sum, entry) => sum + entry.bytes, 0)

    return {
      key: feature.key,
      label: feature.label,
      enabled: Boolean(flags[feature.key]),
      implemented: feature.implemented,
      tables: rows,
      totalRows,
      totalBytes,
      reclaimable: rows.length > 0 && !flags[feature.key],
    }
  })

  const claimed = new Set(owned.map((entry) => entry.table))

  return {
    features,
    unclaimedTables: tables.filter((table) => !claimed.has(table)),
    sizesAreExact: sized.exact,
    sizeNote: sized.note,
    databaseBytes: sized.databaseBytes,
    staleIndexCount,
  }
}
