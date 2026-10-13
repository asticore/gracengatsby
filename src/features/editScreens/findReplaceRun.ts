/**
 * Server side of the find-and-replace tool: reads the documents, plans the
 * changes and, on apply, writes them through the engine as the signed-in user.
 * The matching itself lives in findReplace.ts. Nothing here runs in preview
 * except reads.
 */

import { buildPattern, FIND_REPLACE_LIMITS, replaceInDocument, type FindReplaceCollection, type FindReplaceOptions, type FindReplaceSample } from './findReplace'

export type RunEngine = {
  find(args: { collection: string; depth?: number; limit?: number; page?: number; user?: unknown }): Promise<{ docs: unknown[]; hasNextPage?: boolean }>
  update(args: { collection: string; id: number | string; data: Record<string, unknown>; user?: unknown; overrideAccess?: boolean }): Promise<unknown>
}

export type PlannedChange = {
  collection: FindReplaceCollection
  id: number | string
  title: string
  count: number
  patch: Record<string, unknown>
}

export type FindReplacePlan = {
  changes: PlannedChange[]
  perCollection: Record<FindReplaceCollection, { documents: number; matches: number }>
  documents: number
  matches: number
  samples: FindReplaceSample[]
  /** True when a collection held more documents than the scan reads. Apply refuses to run in that case. */
  truncated: boolean
}

const PAGE_SIZE = 250

/** Reads every live (not trashed) document of one collection, up to the scan ceiling. */
async function readDocuments(engine: RunEngine, user: unknown, collection: string): Promise<{ docs: Record<string, unknown>[]; truncated: boolean }> {
  const docs: Record<string, unknown>[] = []
  const max = FIND_REPLACE_LIMITS.scanDocsPerCollection
  for (let page = 1; ; page++) {
    const result = await engine.find({ collection, depth: 0, limit: PAGE_SIZE, page, user })
    for (const doc of result.docs) {
      const row = doc as Record<string, unknown>
      if (!row.trashedAt) docs.push(row)
    }
    if (!result.hasNextPage) return { docs, truncated: false }
    if (docs.length >= max) return { docs: docs.slice(0, max), truncated: true }
  }
}

/**
 * Works out every change the find and replace would make, without writing
 * anything. Trashed documents are skipped. Each change carries the patch to apply.
 */
export async function planFindReplace(engine: RunEngine, user: unknown, options: FindReplaceOptions): Promise<FindReplacePlan> {
  const pattern = buildPattern(options.find, options)
  const plan: FindReplacePlan = {
    changes: [],
    perCollection: { pages: { documents: 0, matches: 0 }, posts: { documents: 0, matches: 0 }, products: { documents: 0, matches: 0 }, events: { documents: 0, matches: 0 } },
    documents: 0,
    matches: 0,
    samples: [],
    truncated: false,
  }

  for (const collection of options.collections) {
    const read = await readDocuments(engine, user, collection)
    if (read.truncated) plan.truncated = true

    for (const doc of read.docs) {
      const remaining = FIND_REPLACE_LIMITS.sampleCount - plan.samples.length
      const outcome = replaceInDocument(doc, pattern, options.replace, Math.max(0, remaining))
      if (outcome.count === 0) continue

      const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled'
      plan.changes.push({ collection, id: doc.id as number | string, title, count: outcome.count, patch: outcome.patch })
      plan.perCollection[collection].documents += 1
      plan.perCollection[collection].matches += outcome.count
      plan.documents += 1
      plan.matches += outcome.count
      for (const sample of outcome.samples) plan.samples.push({ collection, id: doc.id as number | string, title, ...sample })
    }
  }
  return plan
}

export type ApplyRow = { collection: FindReplaceCollection; id: number | string; ok: boolean; error?: string }

/** Writes the planned changes, one document at a time. A refused document does not stop the rest. */
export async function applyPlan(engine: RunEngine, user: unknown, plan: FindReplacePlan): Promise<ApplyRow[]> {
  const rows: ApplyRow[] = []
  for (const change of plan.changes) {
    try {
      await engine.update({ collection: change.collection, id: change.id, data: change.patch, user, overrideAccess: false })
      rows.push({ collection: change.collection, id: change.id, ok: true })
    } catch (error) {
      const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : 'Could not change this one.'
      rows.push({ collection: change.collection, id: change.id, ok: false, error: message })
    }
  }
  return rows
}
