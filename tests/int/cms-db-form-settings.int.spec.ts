// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findFormSettings, updateFormSettings } from '@/cms/db'
import { encryptSecretHook } from '@/utilities/secretField'

/**
 * FormSettings: the site-wide form defaults GLOBAL (NOT the `Forms`
 * collection - see src/cms/db/globals/formSettings.ts's doc comment for that
 * distinction). Same shape class as security-settings/payment-settings -
 * three top-level `group` fields, every leaf a plain scalar, no blocks/rels/
 * array/select-hasMany/join anywhere in the config, no group nesting another
 * group (see formSettings.ts's doc comment for the confirmed real DDL this
 * checks against).
 *
 * The first two tests prove plain (non-secret) group fields round-trip both
 * ways, including `spam.turnstileSiteKey` alongside its secret sibling
 * `spam.turnstileSecretKey` - confirming the site key is genuinely NOT
 * encrypted (no hooks declared on it in src/globals/FormSettings.ts), and
 * that both columns exist unconditionally even though the real field
 * declares `admin.condition: (_, s) => Boolean(s?.turnstile)` (UI-only,
 * confirmed by generate.ts never reading `field.admin`).
 *
 * The remaining tests exercise the one secret field
 * (`spam.turnstileSecretKey`), same two directions as
 * cms-db-integrations.int.spec.ts's `claudeApiKey` tests:
 *  - Payload writes plaintext -> our find() returns the raw ciphertext,
 *    never the decrypted plaintext.
 *  - We write a pre-encrypted ciphertext (via encryptSecretHook, mirroring
 *    Payload's real beforeChange hook) through updateFormSettings() ->
 *    Payload's real findGlobal() decrypts it back to the original
 *    plaintext. We do NOT write a plain unencrypted string through
 *    updateFormSettings() and expect Payload to read it back correctly -
 *    decryptSecretHook only decrypts values starting with 'enc:v1:', so an
 *    un-prefixed value would come back unchanged, which is not what a real
 *    save through this data layer should ever produce.
 */
describe('cms/db - form-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: three groups flattened and reconstructed, turnstileSiteKey stays plaintext', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'form-settings',
      data: {
        submissions: { storeSubmissions: true, retentionDays: 90, sendAdminNotification: true, notificationRecipients: 'ops@parity.example' },
        spam: { honeypot: true, minimumFillTimeSeconds: 4, turnstile: true, turnstileSiteKey: '0x4AAAparitysite' },
        defaults: { submitButtonLabel: 'Send enquiry', successMessage: 'Thanks - parity!', errorMessage: 'Failed - parity!' },
      },
    })

    const viaOurs = await findFormSettings()
    expect(viaOurs?.submissions).toEqual({
      storeSubmissions: true,
      retentionDays: 90,
      sendAdminNotification: true,
      notificationRecipients: 'ops@parity.example',
    })
    expect(viaOurs?.spam?.honeypot).toBe(true)
    expect(viaOurs?.spam?.minimumFillTimeSeconds).toBe(4)
    expect(viaOurs?.spam?.turnstile).toBe(true)
    expect(viaOurs?.spam?.turnstileSiteKey).toBe('0x4AAAparitysite')
    expect(viaOurs?.defaults).toEqual({
      submitButtonLabel: 'Send enquiry',
      successMessage: 'Thanks - parity!',
      errorMessage: 'Failed - parity!',
    })
  })

  it('writes a global (three groups) Payload can read back', async () => {
    const ours = await updateFormSettings({
      submissions: { storeSubmissions: false, retentionDays: 30, sendAdminNotification: false, notificationRecipients: '' },
      spam: { honeypot: false, minimumFillTimeSeconds: 1, turnstile: false, turnstileSiteKey: '' },
      defaults: { submitButtonLabel: 'Go', successMessage: 'Done - parity!', errorMessage: 'Oops - parity!' },
    })
    expect(ours.submissions?.retentionDays).toBe(30)
    expect(ours.defaults?.submitButtonLabel).toBe('Go')

    const viaPayload = await engine.findGlobal({ slug: 'form-settings', depth: 0 })
    expect((viaPayload.submissions as { retentionDays?: number })?.retentionDays).toBe(30)
    expect((viaPayload.defaults as { submitButtonLabel?: string })?.submitButtonLabel).toBe('Go')
  })

  it('reads a global updated by Payload: spam.turnstileSecretKey comes back as raw ciphertext, not plaintext', async () => {
    await engine.updateGlobal({
      slug: 'form-settings',
      data: { spam: { turnstile: true, turnstileSiteKey: '0x4AAAparitysite', turnstileSecretKey: '0x4AAAparity-secret-A' } },
    })

    const viaOurs = await findFormSettings()
    expect(viaOurs?.spam?.turnstileSecretKey).toBeTruthy()
    expect(viaOurs?.spam?.turnstileSecretKey).not.toBe('0x4AAAparity-secret-A')
    expect(viaOurs?.spam?.turnstileSecretKey?.startsWith('enc:v1:')).toBe(true)
  })

  it('writes a pre-encrypted ciphertext (spam.turnstileSecretKey) Payload decrypts back to the original plaintext', async () => {
    // Mirrors what Payload's real beforeChange hook does before a value ever
    // reaches the database - see secretField.ts's encryptSecretHook. The
    // hook's real type requires a full Payload FieldHookArgs object; only
    // `value` is read at runtime, so the rest is safely cast away here.
    const ciphertext = encryptSecretHook({ value: '0x4AAAparity-secret-B' } as never) as string
    expect(ciphertext.startsWith('enc:v1:')).toBe(true)
    expect(ciphertext).not.toBe('0x4AAAparity-secret-B')

    const ours = await updateFormSettings({ spam: { turnstile: true, turnstileSiteKey: '0x4AAAparitysite', turnstileSecretKey: ciphertext } })
    expect(ours.spam?.turnstileSecretKey).toBe(ciphertext)

    const viaPayload = await engine.findGlobal({ slug: 'form-settings', depth: 0 })
    expect((viaPayload.spam as { turnstileSecretKey?: string })?.turnstileSecretKey).toBe('0x4AAAparity-secret-B')
  })
})
