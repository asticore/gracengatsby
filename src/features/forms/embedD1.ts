import { getCloudflareContext } from '@opennextjs/cloudflare'

import { decideEmbedFrame, type EmbedFrameDecision } from './embedFrame'

/**
 * One small read for the middleware, which has no engine: the form's config and
 * status by public key or numeric id. Held in isolate memory for a minute per
 * key. Fails closed (not frameable), so a database problem never opens a form
 * to be framed anywhere.
 */
const TTL_MS = 60_000
const cache = new Map<string, { at: number; value: EmbedFrameDecision }>()

export async function readEmbedFrameDecision(key: string): Promise<EmbedFrameDecision> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) return hit.value
  let value: EmbedFrameDecision = { frameable: false }
  try {
    const { env } = await getCloudflareContext({ async: true })
    const db = (env as { D1?: D1Database }).D1
    if (db) {
      const numeric = /^\d{1,12}$/.test(key)
      const statement = numeric
        ? db.prepare('SELECT form_config, form_status FROM `eg_forms` WHERE `id` = ? LIMIT 1').bind(Number(key))
        : db.prepare('SELECT form_config, form_status FROM `eg_forms` WHERE `embed_key` = ? LIMIT 1').bind(key)
      const row = (await statement.all()).results?.[0] as { form_config?: unknown; form_status?: string | null } | undefined
      value = decideEmbedFrame(row ? { formConfig: row.form_config, formStatus: row.form_status } : null)
    }
  } catch {
    value = { frameable: false }
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, { at: now, value })
  return value
}
