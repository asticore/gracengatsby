/**
 * Worker entry: wraps the OpenNext-generated worker and adds a `scheduled`
 * handler. Cloudflare's cron trigger (see `triggers.crons` in wrangler.jsonc)
 * calls it every 5 minutes, and it forwards to the app's own cron route so the
 * normal engine and bindings are used for publishing due documents.
 *
 * `.open-next/worker.js` only exists after `opennextjs-cloudflare build`, so the
 * import is invisible to the type checker.
 */

// @ts-ignore - generated at build time by opennextjs-cloudflare
import openNextWorker from './.open-next/worker.js'

// Durable Object classes must stay top-level exports of the Worker entry.
// @ts-ignore - generated at build time by opennextjs-cloudflare
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js'

type CronEnv = { ENGAGE_SECRET?: string } & Record<string, unknown>

type OpenNextWorker = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>
}

/** hex(SHA-256(ENGAGE_SECRET + ':cron')), the same key the cron route expects. */
export async function computeCronKey(engageSecret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${engageSecret}:cron`))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function runScheduled(worker: OpenNextWorker, env: CronEnv, ctx: unknown): Promise<void> {
  const secret = env.ENGAGE_SECRET
  if (!secret) return
  try {
    const request = new Request('https://cron.internal/api/cron/publish-scheduled', {
      method: 'POST',
      headers: { 'x-cron-key': await computeCronKey(secret) },
    })
    const response = await worker.fetch(request, env, ctx)
    if (!response.ok) console.error('scheduled publish failed:', response.status)
  } catch (error) {
    console.error('scheduled publish error:', error)
  }
}

export default {
  fetch: (request: Request, env: unknown, ctx: unknown) => (openNextWorker as OpenNextWorker).fetch(request, env, ctx),
  async scheduled(_event: unknown, env: CronEnv, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(runScheduled(openNextWorker as OpenNextWorker, env, ctx))
  },
}
