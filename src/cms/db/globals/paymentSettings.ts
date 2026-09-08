import { PaymentSettings } from '@/globals/PaymentSettings'

import { createGlobalOps } from '../generic'
import { paymentSettings, paymentSettingsGenerated } from '../schema'

/**
 * Payload's document shape for the `payment-settings` global - see
 * src/globals/PaymentSettings.ts. Same shape class as securitySettings.ts/
 * memberSettings.ts: three top-level `group` fields (`stripe`, `paypal`,
 * `general`), each containing only `row`-wrapped or plain scalar subfields
 * (text/select/checkbox) - no array/blocks/relationship/hasMany-select/join
 * field anywhere in this config, and no group nests another group (confirmed
 * against src/globals/PaymentSettings.ts directly, and against the real
 * generated DDL in src/migrations/schema/settingsSchema.ts's
 * `ac_payment_settings` entry - now `eg_payment_settings`, see
 * tableRenames.ts - every column there is a single `<group>_<field>` prefix,
 * never two deep). So `generateTable()` plus `groupFields:
 * paymentSettingsGenerated.groupFields` (Courses' `seo` mechanism) is the
 * whole of what this needs - unlike ../globals/backupSettings.ts, which had
 * to hand-build its table because ITS `destination` group nests four more
 * groups inside it.
 *
 * `admin.condition`/`admin.description`/`admin.width` are confirmed UI-only
 * the same way as every other settings global modeled so far - generate.ts
 * never reads `field.admin` - moot here anyway since PaymentSettings
 * declares no `admin.condition` field.
 *
 * Three fields are secrets (hooks: { beforeChange: encryptSecretHook,
 * afterRead: decryptSecretHook }, src/utilities/secretField.ts): `stripe.
 * secretKey`, `stripe.webhookSigningSecret`, `paypal.clientSecret`.
 * `stripe.publishableKey` is deliberately NOT a secret (Payload's own field
 * declares no hooks on it) even though it lives beside two secret fields -
 * it's meant to be public, per PaymentSettings.ts's own doc comment.
 * `findPaymentSettings()` returns exactly what's stored: a document Payload
 * wrote comes back with the three secret fields still ciphertext, never
 * decrypted plaintext - confirmed both directions in
 * tests/int/cms-db-payment-settings.int.spec.ts.
 *
 * KNOWN GAP (mirrors the pre-existing Form-block gap noted on
 * generate.ts's isHasManyRelational, and the same gap noted on
 * ../globals/integrations.ts and ../globals/emailSettings.ts):
 * updatePaymentSettings()'s raw column writes do not run encryptSecretHook -
 * a caller writing a plaintext secret through this layer directly, for any
 * of the three fields listed above, would store it unencrypted at rest. Not
 * a problem yet since this layer isn't wired into engine/db.ts, but must be
 * resolved (e.g. by running encryptSecretHook in createGlobalOps, or
 * forbidding plaintext writes to secret fields) before cutover for any
 * global/collection holding a secret field.
 */
export type PaymentSettingsDoc = {
  id: number
  stripe?: {
    enabled?: boolean | null
    testMode?: boolean | null
    publishableKey?: string | null
    secretKey?: string | null
    webhookSigningSecret?: string | null
  } | null
  paypal?: {
    enabled?: boolean | null
    environment?: string | null
    clientId?: string | null
    clientSecret?: string | null
    allowPayPalLater?: boolean | null
  } | null
  general?: {
    currency?: string | null
    captureMethod?: string | null
    statementDescriptor?: string | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(paymentSettings, PaymentSettings, {}, { groupFields: paymentSettingsGenerated.groupFields })

export const findPaymentSettings = ops.find as unknown as () => Promise<PaymentSettingsDoc | null>
export const updatePaymentSettings = ops.update as unknown as (
  data: Partial<Omit<PaymentSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<PaymentSettingsDoc>
