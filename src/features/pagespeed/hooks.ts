import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import type { CollectionAfterChangeHook } from '@/engine'

import { enqueueTest } from './queue'
import { readPageSpeedSettings } from './service'
import { isPageSpeedCollection } from './types'

/**
 * beforeChange: a save never changes the stored PageSpeed columns. The edit form sends every field back,
 * so without this a stale score loaded with the page would overwrite a newer test run.
 */
export const pageSpeedBeforeChange = ({ data }: { data?: Record<string, unknown> }): void => {
  if (!data) return
  delete data.pagespeedScore
  delete data.pagespeedAt
}

/**
 * afterChange: when "Test after publish" is on, queue a test for a document that is published after the
 * save. The cron tick runs it a few minutes later. Never throws and never blocks the save.
 */
export const pageSpeedAfterChange =
  (collection: string): CollectionAfterChangeHook =>
  async ({ doc, req }) => {
    try {
      if (!isPageSpeedCollection(collection)) return doc
      const record = doc as { id?: unknown; _status?: unknown } | null
      const id = Number(record?.id)
      if (!record || record._status !== 'published' || !Number.isInteger(id) || id <= 0) return doc
      const engine = (req as unknown as { engine?: Parameters<typeof readPageSpeedSettings>[0] }).engine
      if (!engine) return doc
      const settings = await readPageSpeedSettings(engine)
      if (!settings.testAfterPublish) return doc
      const { env } = await getCloudflareContext({ async: true })
      await enqueueTest(drizzle(env.D1) as never, collection, id)
    } catch {
      // Best effort only.
    }
    return doc
  }
