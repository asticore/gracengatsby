import { FormSettings } from '@/globals/FormSettings'

import { createGlobalOps } from '../generic'
import { formSettings, formSettingsGenerated } from '../schema'

/**
 * Payload's document shape for the `form-settings` global - see
 * src/globals/FormSettings.ts. NOTE the naming collision this file
 * deliberately avoids: the `Forms` COLLECTION already modeled in this data
 * layer (src/cms/db/collections/forms.ts, exporting `formsFields` etc.) is a
 * different thing entirely - individual form definitions - from this
 * GLOBAL (site-wide defaults every form falls back to). Nothing here
 * imports from or shadows anything in collections/forms.ts.
 *
 * Same shape class as securitySettings.ts/memberSettings.ts/
 * paymentSettings.ts: three top-level `group` fields (`submissions`,
 * `spam`, `defaults`), each containing only plain scalar subfields
 * (text/textarea/number/checkbox) - no array/blocks/relationship/
 * hasMany-select/join field anywhere in this config, and no group nests
 * another group (confirmed against src/globals/FormSettings.ts directly,
 * and against the real generated DDL in
 * src/migrations/schema/settingsSchema.ts's `ac_form_settings` entry - now
 * `eg_form_settings`, see tableRenames.ts - every column there is a single
 * `<group>_<field>` prefix, never two deep). So `generateTable()` plus
 * `groupFields: formSettingsGenerated.groupFields` (Courses' `seo`
 * mechanism) is the whole of what this needs.
 *
 * `spam.turnstileSiteKey`/`spam.turnstileSecretKey` both declare
 * `admin.condition: (_, s) => Boolean(s?.turnstile)` - confirmed UI-only,
 * same as every other settings global modeled so far (generate.ts never
 * reads `field.admin`): both columns exist unconditionally, exactly like
 * Payload's own real `eg_form_settings` table has them, regardless of
 * whether `turnstile` is on.
 *
 * One field is a secret (hooks: { beforeChange: encryptSecretHook,
 * afterRead: decryptSecretHook }, src/utilities/secretField.ts):
 * `spam.turnstileSecretKey`. `spam.turnstileSiteKey` is deliberately NOT a
 * secret (no hooks declared on it) - it's meant to be public, per
 * FormSettings.ts's own field description ("this one is public - it appears
 * in the form itself"). `findFormSettings()` returns exactly what's stored:
 * a document Payload wrote comes back with `turnstileSecretKey` still
 * ciphertext, never decrypted plaintext - confirmed both directions in
 * tests/int/cms-db-form-settings.int.spec.ts.
 *
 * KNOWN GAP (mirrors the pre-existing Form-block gap noted on
 * generate.ts's isHasManyRelational, and the same gap noted on
 * ../globals/integrations.ts, ../globals/emailSettings.ts and
 * ../globals/paymentSettings.ts): updateFormSettings()'s raw column write
 * does not run encryptSecretHook - a caller writing a plaintext secret
 * through this layer directly would store `turnstileSecretKey` unencrypted
 * at rest. Not a problem yet since this layer isn't wired into engine/db.ts,
 * but must be resolved (e.g. by running encryptSecretHook in
 * createGlobalOps, or forbidding plaintext writes to secret fields) before
 * cutover for any global/collection holding a secret field.
 */
export type FormSettingsDoc = {
  id: number
  submissions?: {
    storeSubmissions?: boolean | null
    retentionDays?: number | null
    sendAdminNotification?: boolean | null
    notificationRecipients?: string | null
  } | null
  spam?: {
    honeypot?: boolean | null
    minimumFillTimeSeconds?: number | null
    turnstile?: boolean | null
    turnstileSiteKey?: string | null
    turnstileSecretKey?: string | null
  } | null
  defaults?: {
    submitButtonLabel?: string | null
    successMessage?: string | null
    errorMessage?: string | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(formSettings, FormSettings, {}, { groupFields: formSettingsGenerated.groupFields })

export const findFormSettings = ops.find as unknown as () => Promise<FormSettingsDoc | null>
export const updateFormSettings = ops.update as unknown as (
  data: Partial<Omit<FormSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<FormSettingsDoc>
