/**
 * The destructive half. Everything that could delete data lives in this file
 * so the guardrails can be read in one sitting.
 *
 * The shape of the thing: planning and executing are the same call, and a plan
 * is what you get unless you ask for more. `execute` defaults to false, so the
 * accident-prone path - forgetting a flag, replaying a request, a script that
 * loses an argument - always lands on the harmless one. There is no way to
 * reach a DROP without setting a flag and typing a phrase that names the
 * feature.
 */

import { FEATURES, type FeatureFlags, type FeatureKey } from '@/features/registry'

import type { CleanupDb } from './db'
import { isBookkeepingTable } from './protectedTables'
import { SHARED_OWNER, assignTables, dropOrder, resolveParents } from './tables'
import { tablesForFeature } from './survey'

export type CleanupRequest = {
  feature: string
  /** Must read `drop <feature>` exactly. */
  confirm?: string
  /** False (the default) plans only. */
  execute?: boolean
}

export type CleanupPlan = {
  ok: boolean
  dryRun: boolean
  feature: string
  /** What would be, or was, dropped - in the order the statements run. */
  tables: string[]
  statements: string[]
  dropped: string[]
  /** Why this cannot proceed. Empty means it can. */
  refusals: string[]
  /** Tables removed from the plan by a guardrail, with the reason. */
  withheld: { table: string; reason: string }[]
  errors: { statement: string; error: string }[]
}

/** The phrase an operator has to type. Names the feature so it cannot be reused. */
export const confirmationPhraseFor = (feature: string): string => `drop ${feature}`

export async function runCleanup(
  db: CleanupDb,
  flags: FeatureFlags,
  request: CleanupRequest,
): Promise<CleanupPlan> {
  const dryRun = request.execute !== true
  const plan: CleanupPlan = {
    ok: false,
    dryRun,
    feature: request.feature,
    tables: [],
    statements: [],
    dropped: [],
    refusals: [],
    withheld: [],
    errors: [],
  }

  // The key is used to build table names indirectly, so it is matched against
  // the feature map rather than trusted - an unknown key never reaches SQL.
  const feature = FEATURES.find((entry) => entry.key === request.feature)
  if (!feature) {
    plan.refusals.push(`No feature called "${request.feature}".`)
    return plan
  }

  const key: FeatureKey = feature.key

  if (flags[key]) {
    plan.refusals.push(
      `${feature.label} is switched on. Turn it off in Site Settings before clearing its data.`,
    )
    return plan
  }

  const tables = await db.listTables()
  const owned = assignTables(tables, resolveParents(tables))
  const mine = tablesForFeature(key, owned)

  for (const entry of mine) {
    // Belt and braces: assignTables already drops bookkeeping and shared
    // families, so reaching either of these means something upstream is wrong
    // and the table stays where it is.
    if (isBookkeepingTable(entry.table)) {
      plan.withheld.push({ table: entry.table, reason: 'Engine bookkeeping - never dropped.' })
      continue
    }
    if (entry.owners.includes(SHARED_OWNER)) {
      plan.withheld.push({ table: entry.table, reason: 'Shared content - belongs to no feature.' })
      continue
    }

    // A table two features claim is only safe to drop when the other feature
    // is off as well. The whole run is refused rather than the table skipped:
    // a half-cleared family is worse than an untouched one.
    const liveCoOwners = entry.owners.filter((owner) => owner !== key && flags[owner as FeatureKey])
    if (liveCoOwners.length > 0) {
      plan.refusals.push(
        `${entry.table} is also used by ${liveCoOwners.join(', ')}, which ${liveCoOwners.length > 1 ? 'are' : 'is'} switched on.`,
      )
      continue
    }

    plan.tables.push(entry.table)
  }

  if (plan.refusals.length > 0) return plan

  plan.tables = dropOrder(plan.tables)
  plan.statements = plan.tables.map((table) => `DROP TABLE IF EXISTS \`${table}\``)

  if (plan.tables.length === 0) {
    // Nothing to do is a success, not a failure - the feature is already clear.
    plan.ok = true
    return plan
  }

  if (dryRun) {
    plan.ok = true
    return plan
  }

  const expected = confirmationPhraseFor(key)
  if (request.confirm !== expected) {
    plan.refusals.push(`Type "${expected}" to confirm. Nothing was dropped.`)
    return plan
  }

  for (const statement of plan.statements) {
    try {
      await db.run(statement)
      plan.dropped.push(statement.replace(/^DROP TABLE IF EXISTS `(.+)`$/, '$1'))
    } catch (error) {
      plan.errors.push({ statement, error: String((error as Error)?.message || error) })
    }
  }

  plan.ok = plan.errors.length === 0
  return plan
}
