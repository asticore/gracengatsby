// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { findIntegrations, updateIntegrations } from '@/cms/db'
import { encryptSecretHook } from '@/utilities/secretField'

/**
 * Integrations: the one global with a secret field (claudeApiKey).
 * See src/cms/db/globals/integrations.ts and src/utilities/secretField.ts.
 */
describe('cms/db - integrations global', () => {
  let engine: Engine

  it('reads a global updated by Payload: secret field comes back encrypted, not plaintext', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'integrations',
      data: {
        claudeApiKey: 'test-key-plaintext',
      },
    })

    const viaOurs = await findIntegrations()
    expect(viaOurs?.claudeApiKey).toBeTruthy()
    expect(viaOurs?.claudeApiKey).not.toBe('test-key-plaintext')
    expect(viaOurs?.claudeApiKey?.startsWith('enc:v1:')).toBe(true)
  })

  it('writes a pre-encrypted ciphertext Payload decrypts back to plaintext', async () => {
    const cipher = (plaintext: string) => encryptSecretHook({ value: plaintext } as never) as string
    const encrypted = cipher('test-key-plaintext-B')
    expect(encrypted.startsWith('enc:v1:')).toBe(true)

    const ours = await updateIntegrations({
      claudeApiKey: encrypted,
    })
    expect(ours.claudeApiKey).toBe(encrypted)

    const viaPayload = await engine.findGlobal({ slug: 'integrations', depth: 0 })
    expect((viaPayload as any).claudeApiKey).toBe('test-key-plaintext-B')
  })
})
