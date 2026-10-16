import { getEngine } from '@/lib/engine'

import { normaliseSettings } from './manifest'
import type { TemplateRepoSettings } from './types'

/**
 * Reads the template repository settings from the Integrations global, server
 * side only. The global's field hooks decrypt the token on read. The token goes
 * no further than the GitHub request built in ./fetch.ts.
 */
export async function readTemplateRepoSettings(): Promise<TemplateRepoSettings> {
  const engine = await getEngine()
  const integrations = (await engine
    .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
    .catch((): null => null)) as Record<string, unknown> | null
  return normaliseSettings(integrations?.templateRepos)
}
