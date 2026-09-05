import { getCloudflareContext } from '@opennextjs/cloudflare'
import { drizzle } from 'drizzle-orm/d1'
import type { GetPlatformProxyOptions } from 'wrangler'

import * as schema from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

let cached: Db | undefined

/**
 * Gets the D1 binding the same way src/engage.config.ts does for Payload's
 * own adapter: `getCloudflareContext()` only resolves inside the actual
 * opennextjs-cloudflare runtime (production, or `next dev`/`wrangler dev`),
 * so anywhere else - the CLI, and this app's own vitest suite included -
 * falls back to wrangler's `getPlatformProxy()` against the local emulated
 * D1. Not the vendor package either way, just the Cloudflare/Next runtime
 * glue this app already depends on everywhere.
 */
async function resolveD1Binding(): Promise<D1Database> {
  const isProduction = process.env.NODE_ENV === 'production' && !process.env.VITEST
  if (!isProduction) {
    const { getPlatformProxy } = await import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`)
    const proxy = await getPlatformProxy({ environment: process.env.CLOUDFLARE_ENV } satisfies GetPlatformProxyOptions)
    return (proxy.env as { D1: D1Database }).D1
  }
  const { env } = await getCloudflareContext({ async: true })
  return env.D1
}

/** Returns a drizzle client bound to the app's D1 database. */
export async function getDb(): Promise<Db> {
  if (cached) return cached
  const binding = await resolveD1Binding()
  cached = drizzle(binding, { schema })
  return cached
}
