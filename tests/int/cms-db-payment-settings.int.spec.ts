// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findPaymentSettings, updatePaymentSettings } from '@/cms/db'
import { encryptSecretHook } from '@/utilities/secretField'

/**
 * PaymentSettings: same shape class as security-settings/member-settings
 * (see cms-db-security-settings.int.spec.ts's own doc comment) - three
 * top-level `group` fields, every leaf a plain scalar, no blocks/rels/array/
 * select-hasMany/join anywhere in the config, no group nesting another group
 * (see src/cms/db/globals/paymentSettings.ts's doc comment for the confirmed
 * real DDL this checks against).
 *
 * The first two tests prove plain (non-secret) group fields round-trip both
 * ways, including `stripe.publishableKey` alongside its two secret
 * siblings - confirming that field is genuinely NOT encrypted (no hooks
 * declared on it in src/globals/PaymentSettings.ts), unlike `stripe.
 * secretKey`/`stripe.webhookSigningSecret` right next to it.
 *
 * The remaining tests exercise the three secret fields
 * (`stripe.secretKey`, `stripe.webhookSigningSecret`, `paypal.clientSecret`),
 * same two directions as cms-db-integrations.int.spec.ts's `claudeApiKey`
 * tests:
 *  - Payload writes plaintext -> our find() returns the raw ciphertext,
 *    never the decrypted plaintext.
 *  - We write a pre-encrypted ciphertext (via encryptSecretHook, mirroring
 *    Payload's real beforeChange hook) through updatePaymentSettings() ->
 *    Payload's real findGlobal() decrypts it back to the original
 *    plaintext. We do NOT write a plain unencrypted string through
 *    updatePaymentSettings() and expect Payload to read it back correctly -
 *    decryptSecretHook only decrypts values starting with 'enc:v1:', so an
 *    un-prefixed value would come back unchanged, which is not what a real
 *    save through this data layer should ever produce.
 */
describe('cms/db - payment-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: three groups flattened and reconstructed, publishableKey stays plaintext', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'payment-settings',
      data: {
        stripe: { enabled: true, testMode: true, publishableKey: 'pk_test_parity123' },
        paypal: { enabled: false, environment: 'sandbox', clientId: 'paypal-client-parity', allowPayPalLater: true },
        general: { currency: 'USD', captureMethod: 'manual', statementDescriptor: 'PARITY SHOP' },
      },
    })

    const viaOurs = await findPaymentSettings()
    expect(viaOurs?.stripe?.enabled).toBe(true)
    expect(viaOurs?.stripe?.testMode).toBe(true)
    expect(viaOurs?.stripe?.publishableKey).toBe('pk_test_parity123')
    // toMatchObject, not toEqual: `paypal.clientSecret` is a real column this
    // group always reconstructs (see Phase 19's flattenGroups fix - an
    // untouched secret field comes back explicitly `null`, not omitted) -
    // this test only cares about the plain fields it just wrote; the secret
    // round-trip itself is covered by the dedicated tests below.
    expect(viaOurs?.paypal).toMatchObject({ enabled: false, environment: 'sandbox', clientId: 'paypal-client-parity', allowPayPalLater: true })
    expect(viaOurs?.general).toEqual({ currency: 'USD', captureMethod: 'manual', statementDescriptor: 'PARITY SHOP' })
  })

  it('writes a global (three groups) Payload can read back', async () => {
    const ours = await updatePaymentSettings({
      stripe: { enabled: true, testMode: false, publishableKey: 'pk_live_parity456' },
      paypal: { enabled: true, environment: 'live', clientId: 'paypal-client-live', allowPayPalLater: false },
      general: { currency: 'GBP', captureMethod: 'automatic', statementDescriptor: 'PARITY LTD' },
    })
    expect(ours.stripe?.publishableKey).toBe('pk_live_parity456')
    expect(ours.general?.currency).toBe('GBP')

    const viaPayload = await engine.findGlobal({ slug: 'payment-settings', depth: 0 })
    expect((viaPayload.stripe as { publishableKey?: string })?.publishableKey).toBe('pk_live_parity456')
    expect((viaPayload.general as { currency?: string })?.currency).toBe('GBP')
  })

  it('reads a global updated by Payload: stripe.secretKey and stripe.webhookSigningSecret come back as raw ciphertext, not plaintext', async () => {
    await engine.updateGlobal({
      slug: 'payment-settings',
      data: {
        stripe: {
          publishableKey: 'pk_test_parity123',
          secretKey: 'sk_test_parity-secret-A',
          webhookSigningSecret: 'whsec_parity-secret-A',
        },
      },
    })

    const viaOurs = await findPaymentSettings()
    expect(viaOurs?.stripe?.secretKey).toBeTruthy()
    expect(viaOurs?.stripe?.secretKey).not.toBe('sk_test_parity-secret-A')
    expect(viaOurs?.stripe?.secretKey?.startsWith('enc:v1:')).toBe(true)
    expect(viaOurs?.stripe?.webhookSigningSecret).toBeTruthy()
    expect(viaOurs?.stripe?.webhookSigningSecret).not.toBe('whsec_parity-secret-A')
    expect(viaOurs?.stripe?.webhookSigningSecret?.startsWith('enc:v1:')).toBe(true)
  })

  it('reads a global updated by Payload: paypal.clientSecret comes back as raw ciphertext, not plaintext', async () => {
    await engine.updateGlobal({
      slug: 'payment-settings',
      data: { paypal: { clientId: 'paypal-client-parity', clientSecret: 'paypal-secret-parity-A' } },
    })

    const viaOurs = await findPaymentSettings()
    expect(viaOurs?.paypal?.clientSecret).toBeTruthy()
    expect(viaOurs?.paypal?.clientSecret).not.toBe('paypal-secret-parity-A')
    expect(viaOurs?.paypal?.clientSecret?.startsWith('enc:v1:')).toBe(true)
  })

  it('writes pre-encrypted ciphertexts (stripe.secretKey, stripe.webhookSigningSecret, paypal.clientSecret) Payload decrypts back to the original plaintext', async () => {
    // Mirrors what Payload's real beforeChange hook does before a value ever
    // reaches the database - see secretField.ts's encryptSecretHook. The
    // hook's real type requires a full Payload FieldHookArgs object; only
    // `value` is read at runtime, so the rest is safely cast away here.
    const secretKeyCipher = encryptSecretHook({ value: 'sk_test_parity-secret-B' } as never) as string
    const webhookCipher = encryptSecretHook({ value: 'whsec_parity-secret-B' } as never) as string
    const clientSecretCipher = encryptSecretHook({ value: 'paypal-secret-parity-B' } as never) as string
    for (const cipher of [secretKeyCipher, webhookCipher, clientSecretCipher]) {
      expect(cipher.startsWith('enc:v1:')).toBe(true)
    }

    const ours = await updatePaymentSettings({
      stripe: { publishableKey: 'pk_test_parity123', secretKey: secretKeyCipher, webhookSigningSecret: webhookCipher },
      paypal: { clientId: 'paypal-client-parity', clientSecret: clientSecretCipher },
    })
    expect(ours.stripe?.secretKey).toBe(secretKeyCipher)
    expect(ours.stripe?.webhookSigningSecret).toBe(webhookCipher)
    expect(ours.paypal?.clientSecret).toBe(clientSecretCipher)

    const viaPayload = await engine.findGlobal({ slug: 'payment-settings', depth: 0 })
    expect((viaPayload.stripe as { secretKey?: string })?.secretKey).toBe('sk_test_parity-secret-B')
    expect((viaPayload.stripe as { webhookSigningSecret?: string })?.webhookSigningSecret).toBe('whsec_parity-secret-B')
    expect((viaPayload.paypal as { clientSecret?: string })?.clientSecret).toBe('paypal-secret-parity-B')
  })
})
