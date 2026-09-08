import { Integrations } from '@/globals/Integrations'

import { createGlobalOps } from '../generic'
import { integrations } from '../schema'

/**
 * Payload's document shape for the `integrations` global - see
 * src/globals/Integrations.ts. `claudeApiKey` is declared as a plain `text`
 * column (no new column-type work needed) but carries `hooks: {
 * beforeChange: encryptSecretHook, afterRead: decryptSecretHook }`
 * (src/utilities/secretField.ts) - AES-256-GCM encryption that happens
 * entirely inside Payload's own field-hook pipeline, which this data layer's
 * generic ops do NOT run (they read/write the raw column value directly -
 * see ../generic.ts's doc comments). So `findIntegrations()` returns exactly
 * what's stored: a document Payload wrote comes back with `claudeApiKey`
 * still ciphertext (`enc:v1:...`, PREFIX in secretField.ts), never the
 * decrypted plaintext - confirmed in
 * tests/int/cms-db-integrations.int.spec.ts, which also proves the reverse
 * direction (a valid ciphertext string written through `updateIntegrations()`
 * is decrypted back to the original plaintext by Payload's real
 * `afterRead` hook).
 *
 * KNOWN GAP (mirrors the pre-existing Form-block gap noted on
 * generate.ts's isHasManyRelational): updateIntegrations()'s raw column
 * write does not run encryptSecretHook - a caller writing a plaintext secret
 * through this layer directly would store `claudeApiKey` unencrypted at
 * rest. Not a problem yet since this layer isn't wired into engine/db.ts,
 * but must be resolved (e.g. by running encryptSecretHook in
 * createGlobalOps, or forbidding plaintext writes to secret fields) before
 * cutover for any global/collection holding a secret field -
 * ../globals/emailSettings.ts has the same gap, seven fields wide.
 */
export type IntegrationsDoc = {
  id: number
  claudeApiKey?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(integrations, Integrations)

export const findIntegrations = ops.find as unknown as () => Promise<IntegrationsDoc | null>
export const updateIntegrations = ops.update as unknown as (
  data: Partial<Omit<IntegrationsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<IntegrationsDoc>
