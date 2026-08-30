'use server'

/**
 * What the admin screen's buttons call.
 *
 * The routes next door want the internal key as well as a session, which the
 * browser cannot supply - the key is a deploy secret and handing it to the
 * page would publish it to anyone who opens the console. So the screen goes
 * through server actions instead: same core, same guardrails, with the admin
 * session as the boundary. The routes stay for operators and the deploy
 * pipeline, which can hold a secret.
 */

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { getFeatureFlags } from '@/utilities/features'

import { runCleanup, type CleanupPlan, type CleanupRequest } from './cleanup'
import { getCleanupDb, hasAdminSession } from './guard'
import { tidyIndexNames, type IndexTidyReport } from './indexNames'

const NO_DB = 'No database binding is available in this environment.'

const refused = (feature: string, dryRun: boolean, reason: string): CleanupPlan => ({
  ok: false,
  dryRun,
  feature,
  tables: [],
  statements: [],
  dropped: [],
  refusals: [reason],
  withheld: [],
  errors: [],
})

export async function cleanupFeatureAction(request: CleanupRequest): Promise<CleanupPlan> {
  const dryRun = request.execute !== true

  if (!(await hasAdminSession(await headers()))) {
    return refused(request.feature, dryRun, 'Not permitted.')
  }

  const db = await getCleanupDb()
  if (!db) return refused(request.feature, dryRun, NO_DB)

  const result = await runCleanup(db, await getFeatureFlags(), request)

  // A completed drop changes every count on the screen behind it.
  if (!result.dryRun && result.dropped.length > 0) revalidatePath('/admin/database')

  return result
}

export async function tidyIndexNamesAction(execute: boolean): Promise<IndexTidyReport> {
  const empty: IndexTidyReport = {
    ok: false,
    dryRun: !execute,
    renames: [],
    renamed: [],
    skipped: 0,
    errors: [],
  }

  if (!(await hasAdminSession(await headers()))) {
    return { ...empty, errors: [{ statement: '', error: 'Not permitted.' }] }
  }

  const db = await getCleanupDb()
  if (!db) return { ...empty, errors: [{ statement: '', error: NO_DB }] }

  const report = await tidyIndexNames(db, execute)
  if (execute && report.renamed.length > 0) revalidatePath('/admin/database')
  return report
}
