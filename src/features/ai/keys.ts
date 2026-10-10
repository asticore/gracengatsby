import { getEngine } from '@/lib/engine'

import { AI_PROVIDERS, type AiProvider } from './models'

/**
 * Reads the AI keys from the Integrations global, server side only. The global's
 * field hooks decrypt them on read. Returns null for a missing key, and never
 * returns a key to anything that is not this server code.
 */
export async function readAiKey(provider: AiProvider): Promise<string | null> {
  const engine = await getEngine()
  const integrations = (await engine
    .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
    .catch((): null => null)) as Record<string, unknown> | null
  const value = integrations?.[provider === 'claude' ? 'claudeApiKey' : 'openaiApiKey']
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Which providers have a key set. Safe to send to the browser: it reports presence, not the key. */
export async function aiKeyAvailability(): Promise<Record<AiProvider, boolean>> {
  const result = {} as Record<AiProvider, boolean>
  for (const provider of AI_PROVIDERS) {
    result[provider] = Boolean(await readAiKey(provider).catch((): null => null))
  }
  return result
}
