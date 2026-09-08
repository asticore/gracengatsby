// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findEmailSettings, updateEmailSettings } from '@/cms/db'
import { encryptSecretHook } from '@/utilities/secretField'

/**
 * Phase 20: EmailSettings, the third GLOBAL - see
 * src/cms/db/globals/emailSettings.ts's doc comment for the full field
 * breakdown (group fields per provider, the top-level `row` field, the
 * stripped `testing.sendTest` ui field) and its KNOWN GAP note.
 *
 * The first test proves the `group` flattening/nesting round-trips for a
 * PLAIN (non-secret) nested field (`mailgun.domain`) alongside a top-level
 * scalar and a `row`-wrapped field, the same shape FaqSettings' parity tests
 * already proved for a global without groups. The second and third tests
 * exercise a secret field living INSIDE a group (`mailgun.apiKey`), same two
 * directions as cms-db-integrations.int.spec.ts's `claudeApiKey` tests:
 *  - Payload writes plaintext -> our find() returns the raw ciphertext,
 *    never the decrypted plaintext.
 *  - We write a pre-encrypted ciphertext (via encryptSecretHook, mirroring
 *    Payload's real beforeChange hook) through updateEmailSettings() ->
 *    Payload's real findGlobal() decrypts it back to the original
 *    plaintext. We do NOT write a plain unencrypted string through
 *    updateEmailSettings() and expect Payload to read it back correctly -
 *    decryptSecretHook only decrypts values starting with 'enc:v1:', so an
 *    un-prefixed value would come back unchanged, which is not what a real
 *    save through this data layer should ever produce.
 */
describe('cms/db - email-settings global (proof of concept, not wired in)', () => {
  let engine: Engine

  it('reads a global updated by Payload: top-level, row, and group (non-secret) fields', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'email-settings',
      data: {
        provider: 'mailgun',
        fromName: 'Parity Test Sender',
        mailgun: { domain: 'mail.parity-test.example', region: 'eu' },
      },
    })

    const viaOurs = await findEmailSettings()
    expect(viaOurs?.provider).toBe('mailgun')
    expect(viaOurs?.fromName).toBe('Parity Test Sender')
    expect(viaOurs?.mailgun?.domain).toBe('mail.parity-test.example')
    expect(viaOurs?.mailgun?.region).toBe('eu')
  })

  it('reads a global updated by Payload: a secret field nested in a group comes back as raw ciphertext, not plaintext', async () => {
    const plaintext = 'key-parity-test-secret-A'

    await engine.updateGlobal({
      slug: 'email-settings',
      data: { mailgun: { apiKey: plaintext } },
    })

    const viaOurs = await findEmailSettings()
    expect(viaOurs?.mailgun?.apiKey).toBeTruthy()
    expect(viaOurs?.mailgun?.apiKey).not.toBe(plaintext)
    expect(viaOurs?.mailgun?.apiKey?.startsWith('enc:v1:')).toBe(true)
  })

  it('writes a pre-encrypted ciphertext (nested in a group) Payload decrypts back to the original plaintext', async () => {
    const plaintext = 'key-parity-test-secret-B'
    // Mirrors what Payload's real beforeChange hook does before a value ever
    // reaches the database - see secretField.ts's encryptSecretHook. The
    // hook's real type requires a full Payload FieldHookArgs object; only
    // `value` is read at runtime, so the rest is safely cast away here.
    const ciphertext = encryptSecretHook({ value: plaintext } as never) as string
    expect(ciphertext.startsWith('enc:v1:')).toBe(true)
    expect(ciphertext).not.toBe(plaintext)

    const ours = await updateEmailSettings({ mailgun: { apiKey: ciphertext, domain: 'mail.parity-test.example' } })
    expect(ours.mailgun?.apiKey).toBe(ciphertext)

    const viaPayload = await engine.findGlobal({ slug: 'email-settings', depth: 0 })
    expect((viaPayload.mailgun as { apiKey?: string })?.apiKey).toBe(plaintext)
  })
})
