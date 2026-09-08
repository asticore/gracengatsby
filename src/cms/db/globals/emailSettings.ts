import { EmailSettings } from '@/globals/EmailSettings'

import { createGlobalOps } from '../generic'
import { emailSettings, emailSettingsGenerated } from '../schema'

/**
 * Payload's document shape for the `email-settings` global - see
 * src/globals/EmailSettings.ts. The top-level `row` field (fromName/
 * fromEmail/replyToEmail) is a layout-only wrapper - flattened onto this
 * table with no nesting in the JS shape, same as every other `row` field
 * this data layer models. Each provider (resend/sesApi/mailgun/postmark/
 * sendgrid/cloudflare/smtp) and `testing` are `group` fields - flattened
 * onto this table with a `<group>_` column prefix and reconstructed here as
 * a nested object, the same mechanism Events' `location` group uses (see
 * src/cms/db/collections/events.ts). Each group's own `admin.condition`
 * (which provider is selected) is Payload admin-UI-only and has no effect on
 * the schema - every group's columns exist unconditionally, exactly as
 * Payload's own real `eg_email_settings` table has them.
 *
 * Eight fields are secrets (hooks: { beforeChange: encryptSecretHook,
 * afterRead: decryptSecretHook }, src/utilities/secretField.ts, same
 * raw-column caveat as ../globals/integrations.ts): `resend.apiKey`,
 * `sesApi.accessKeyId`, `sesApi.secretAccessKey`, `mailgun.apiKey`,
 * `postmark.serverToken`, `sendgrid.apiKey`, `cloudflare.apiToken`, and
 * `smtp.password`. `findEmailSettings()` returns exactly what's stored - a
 * document Payload wrote comes back with these still ciphertext, never
 * decrypted plaintext - confirmed both directions in
 * tests/int/cms-db-email-settings.int.spec.ts.
 *
 * `testing.sendTest` is a `type: 'ui'` field (renders a button, backed by no
 * column at all - Payload never gives a `ui` field a column). It is stripped
 * out of the field list fed to `generateTable` in ../schema/index.ts (see
 * that file's `emailSettingsGenerated` doc comment for why) and has no place
 * in this Doc type - it isn't data, so it gets no test coverage either.
 *
 * KNOWN GAP (mirrors the pre-existing Form-block gap noted on
 * generate.ts's isHasManyRelational, and the same gap noted on
 * ../globals/integrations.ts): updateEmailSettings()'s raw column writes do
 * not run encryptSecretHook - a caller writing a plaintext secret through
 * this layer directly, for any of the eight fields listed above, would store
 * it unencrypted at rest. Not a problem yet since this layer isn't wired
 * into engine/db.ts, but must be resolved (e.g. by running encryptSecretHook
 * in createGlobalOps, or forbidding plaintext writes to secret fields)
 * before cutover for any global/collection holding a secret field.
 */
export type EmailSettingsDoc = {
  id: number
  provider?: string | null
  fromName?: string | null
  fromEmail?: string | null
  replyToEmail?: string | null
  resend?: { apiKey?: string | null }
  sesApi?: { accessKeyId?: string | null; secretAccessKey?: string | null; region?: string | null }
  mailgun?: { apiKey?: string | null; domain?: string | null; region?: string | null }
  postmark?: { serverToken?: string | null; messageStream?: string | null }
  sendgrid?: { apiKey?: string | null }
  cloudflare?: { apiToken?: string | null; accountId?: string | null }
  smtp?: { host?: string | null; port?: number | null; username?: string | null; password?: string | null }
  testing?: { testRecipient?: string | null }
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(emailSettings, EmailSettings, {}, { groupFields: emailSettingsGenerated.groupFields })

export const findEmailSettings = ops.find as unknown as () => Promise<EmailSettingsDoc | null>
export const updateEmailSettings = ops.update as unknown as (
  data: Partial<Omit<EmailSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EmailSettingsDoc>
