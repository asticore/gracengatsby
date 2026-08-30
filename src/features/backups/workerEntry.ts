/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - built output; it does not exist until `opennextjs-cloudflare
// build` has run, so this cannot be @ts-expect-error - that would flip to an
// error of its own the moment the file IS there.
import worker from '../../../.open-next/worker.js'

import { runScheduledBackup } from './scheduled'

/**
 * The Worker entry point, wrapping the generated one.
 *
 * Cloudflare Cron Triggers invoke a Worker's `scheduled` export and nothing
 * else. The bundle that the adapter generates at `.open-next/worker.js` only
 * exports `fetch`, so a cron trigger pointed at it fires into a handler that
 * does not exist - which fails silently rather than loudly, since there is no
 * request and nobody watching.
 *
 * So `main` in wrangler.jsonc points here instead. `fetch` is passed straight
 * through untouched, which is the important part: every request in the site
 * still goes through the adapter's own worker exactly as before, and this file
 * only adds a second door.
 *
 * Anything the generated worker exports besides `fetch` - the queue handler and
 * the cache durable objects the adapter can emit - is re-exported below by
 * spreading it, so turning one of those on later does not require editing this
 * file to keep it working.
 */

type ScheduledEnv = { D1: D1Database; R2: R2Bucket }

const generated = worker as {
  fetch: ExportedHandlerFetchHandler
  [key: string]: unknown
}

export default {
  ...generated,

  async scheduled(controller: ScheduledController, env: ScheduledEnv, ctx: ExecutionContext): Promise<void> {
    // waitUntil rather than await: the platform's own limit on a scheduled
    // invocation is what should end a long backup, not an unhandled rejection
    // from something else in the same firing.
    ctx.waitUntil(
      runScheduledBackup(env, new Date(controller.scheduledTime)).then((result) => {
        console.log(JSON.stringify({ level: 'info', msg: 'Backup cron', result }))
      }),
    )
  },
} satisfies ExportedHandler<ScheduledEnv>
