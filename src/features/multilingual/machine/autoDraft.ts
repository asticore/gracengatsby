/**
 * Auto-draft on save: when a source document is saved, machine drafts are written for
 * its changed fields in every target language. Off by default (Languages > Machine
 * translation > "Draft automatically when a page is saved").
 *
 * The provider work does not hold up the save. It is scheduled with the platform's
 * waitUntil where there is one, the same way the IndexNow hook runs, and it never throws
 * into the save: a failure is logged and the document is saved as it would have been
 * without this feature. A system write has no signed-in user, so the drafts are written
 * under the same review rules as a manual one (see drafts.ts).
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { getMultilingualSettings, type MultilingualSettings } from '../settings'
import { findTranslations, sourceTextOf, valueAtPath } from '../store'
import { sourceIdFor, translatableSource } from '../translatableFields'
import { runMachineDrafts, type DraftItem } from './drafts'
import type { MachineDeps } from './providers'
import type { UsageD1 } from './usage'

type EngineLike = {
  findGlobal: (args: { slug: string; depth?: number; overrideAccess?: boolean }) => Promise<Record<string, unknown>>
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

/** Runs work after the response where the platform allows it. Never rejects. */
const after = (work: Promise<unknown>): void => {
  void getCloudflareContext({ async: true })
    .then(({ ctx }) => {
      const waitUntil = (ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined)?.waitUntil
      if (waitUntil) waitUntil(work)
      else void work
    })
    .catch(() => {
      void work
    })
}

/** The draft items for one source document: its translatable fields with their current text. */
export function draftItemsForDocument(slug: string, doc: Record<string, unknown>): DraftItem[] {
  const source = translatableSource(slug)
  if (!source || doc.id === undefined || doc.id === null) return []
  const fields = source.fields
    .map((field) => ({ fieldPath: field.path, sourceText: sourceTextOf(valueAtPath(doc, field.path)) }))
    .filter((field) => field.sourceText.length > 0)
  if (fields.length === 0) return []
  return [{ sourceKind: 'collection', sourceId: sourceIdFor(slug, String(doc.id)), fields }]
}

/**
 * Drafts the changed fields of one saved document. Resolves when done; never rejects.
 * Exported so the tests can run it directly.
 */
export async function autoDraftDocument(args: {
  engine: EngineLike
  slug: string
  doc: Record<string, unknown>
  settings?: MultilingualSettings
  now?: Date
  d1?: UsageD1
  deps?: MachineDeps
}): Promise<void> {
  try {
    const settings = args.settings ?? (await getMultilingualSettings(args.engine))
    if (!settings.enabled || !settings.machine.enabled || !settings.machine.autoDraft) return
    const items = draftItemsForDocument(args.slug, args.doc)
    if (items.length === 0) return
    const locales = settings.activeLocales.filter((code) => code !== settings.defaultLocale)
    if (locales.length === 0) return
    const stored = await findTranslations(args.engine as never, {
      locales,
      sourceKind: 'collection',
      sourceId: items[0].sourceId,
    })
    await runMachineDrafts({
      engine: args.engine,
      user: null,
      items,
      locales,
      stored,
      overwrite: false,
      settings,
      provider: null,
      now: args.now,
      d1: args.d1,
      deps: args.deps,
    })
  } catch (error) {
    console.error('[machine-translation] auto-draft failed:', error instanceof Error ? error.message : 'unknown error')
  }
}

type AfterChangeArgs = { doc: Record<string, unknown>; req?: { engine?: unknown } | null }

/** An afterChange hook for a translatable collection. The save is never held up or failed by it. */
export const machineAutoDraftAfterChange =
  (slug: string) =>
  async (args: unknown): Promise<unknown> => {
    const { doc, req } = args as AfterChangeArgs
    try {
      const engine = req?.engine as EngineLike | undefined
      if (engine && doc) after(autoDraftDocument({ engine, slug, doc }))
    } catch {
      // Drafting is an extra; a hook failure must never fail the save.
    }
    return doc
  }
