import { drizzle } from 'drizzle-orm/d1'
import { resolveD1Binding } from './d1Binding'
import * as schema from './schema'

export { resolveD1Binding }

export type Db = ReturnType<typeof drizzle<typeof schema>>

let cached: Db | undefined

/** Returns a drizzle client bound to the app's D1 database. */
export async function getDb(): Promise<Db> {
  if (cached) return cached
  const binding = await resolveD1Binding()
  cached = drizzle(binding, { schema })
  return cached
}
