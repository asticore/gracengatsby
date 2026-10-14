import type { CommunicationsDoc } from './connections'
import type { EmailSettingsDoc } from './types'

import { mergeConnections } from './connections'

/**
 * Reads the saved provider keys (Integrations, communications group) and the
 * sender details (Email settings) and merges them for the send path. Server
 * only: it asks the engine, and the engine decrypts the secret fields on read.
 *
 * Integrations is read with overrideAccess because its own read rule is
 * admin-only, and the send path runs for anonymous visitors (a form submission
 * sends a notification). A missing row is not an error - it means nothing is
 * connected yet.
 */

type FindGlobal = (args: { slug: string; depth: number; overrideAccess: boolean }) => Promise<unknown>

export async function loadEmailSettings(engine: { findGlobal: FindGlobal }): Promise<EmailSettingsDoc> {
  const legacy = (await engine.findGlobal({ slug: 'email-settings', depth: 0, overrideAccess: true })) as EmailSettingsDoc
  const integrations = (await engine
    .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
    .catch((): null => null)) as { communications?: CommunicationsDoc } | null
  return mergeConnections(integrations?.communications ?? null, legacy)
}

/** The saved text message settings, or null when they cannot be read. Never throws. */
export async function loadSmsSettings(engine: { findGlobal: FindGlobal }) {
  try {
    const integrations = (await engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })) as {
      communications?: CommunicationsDoc
    } | null
    return integrations?.communications?.sms ?? null
  } catch {
    return null
  }
}
