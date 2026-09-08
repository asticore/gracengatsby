// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findIntegrations, updateIntegrations } from '@/cms/db'
import { encryptSecretHook } from '@/utilities/secretField'

/**
 * Phase 19: Integrations, the second GLOBAL this data layer models - see
 * src/cms/db/globals/integrations.ts's doc comment for the full field
 * breakdown and its KNOWN GAP note (this layer's own writes don't encrypt).
 *
 * Both directions here specifically exercise the encrypted `claudeApiKey`
 * field, since that's the one place this global's behaviour diverges from
 * FaqSettings' plain-scalar parity tests:
 *  - Payload writes plaintext -> our find() must return the raw ciphertext
 *    Payload's beforeChange hook produced, NOT the plaintext - proving our
 *    ops don't try to decrypt (they can't; they don't know the field is
 *    encrypted) and genuinely proving the value is encrypted at rest.
 *  - We write a pre-encrypted ciphertext (produced by calling
 *    encryptSecretHook ourselves, mirroring what Payload's real
 *    beforeChange hook would do) through our own updateIntegrations() ->
 *    Payload's real findGlobal() must decrypt it back to the original
 *    plaintext via its own afterRead hook, proving the storage FORMAT round
 *    trips correctly through our raw-column write. We do NOT write a plain
 *    unencrypted string through updateIntegrations() and expect Payload to
 *    read it back correctly - decryptSecretHook only decrypts values
 *    starting with the 'enc:v1:' prefix, so Payload would just hand the
 *    plaintext back unchanged, which is not what a real save through this
 *    data layer should ever produce.
 */
describe('cms/db - integrations global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: the secret field comes back as raw ciphertext, not plaintext', async () => {
    engine = await getEngine()
    const plaintext = 'sk-ant-parity-test-secret-A'

    await engine.updateGlobal({
      slug: 'integrations',
      data: { claudeApiKey: plaintext },
    })

    const viaOurs = await findIntegrations()
    expect(viaOurs?.claudeApiKey).toBeTruthy()
    expect(viaOurs?.claudeApiKey).not.toBe(plaintext)
    expect(viaOurs?.claudeApiKey?.startsWith('enc:v1:')).toBe(true)
  })

  it('writes a pre-encrypted ciphertext Payload decrypts back to the original plaintext', async () => {
    const plaintext = 'sk-ant-parity-test-secret-B'
    // Mirrors what Payload's real beforeChange hook does before a value ever
    // reaches the database - see secretField.ts's encryptSecretHook. The
    // hook's real type requires a full Payload FieldHookArgs object; only
    // `value` is read at runtime, so the rest is safely cast away here.
    const ciphertext = encryptSecretHook({ value: plaintext } as never) as string
    expect(ciphertext.startsWith('enc:v1:')).toBe(true)
    expect(ciphertext).not.toBe(plaintext)

    const ours = await updateIntegrations({ claudeApiKey: ciphertext })
    expect(ours.claudeApiKey).toBe(ciphertext)

    const viaPayload = await engine.findGlobal({ slug: 'integrations', depth: 0 })
    expect(viaPayload.claudeApiKey).toBe(plaintext)
  })
})
