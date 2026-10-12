import type { CollectionBeforeChangeHook, FieldHook } from '@/engine'

import { can } from '@/features/roles/permissions'
import { decryptSecretHook, encryptSecretHook } from '@/utilities/secretField'

import { generateEmbedKey, normaliseFormConfig } from './config'
import { sanitiseLayout } from './layout'
import type { FormConfig, FormWebhook } from './types'
import { isSafeWebhookUrl } from './webhooks'

/**
 * The write and read rules for the form's own columns.
 *
 * Written once here so the REST API, the visual editor and any import go
 * through the same gate:
 *
 *  - the layout trees are sanitised (shape, depth, size) before they are stored;
 *  - `formConfig` is normalised, and the parts that only an administrator may
 *    change (webhooks, which websites may embed) are restored from the stored
 *    copy when someone else saves;
 *  - webhook secrets are encrypted at rest, shown masked to anyone using the
 *    admin, and decrypted only for the server's own reads (no user attached).
 */

/** Shown in place of a stored secret. Sending it back unchanged keeps the stored one. */
export const SECRET_MASK = '********'

const throwValidation = async (path: string, message: string): Promise<never> => {
  const { ValidationError } = await import('@/localapi/operations')
  throw new ValidationError([{ path, message }])
}

type Json = Record<string, unknown>

const asRecord = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {})

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export const formsBeforeChange: CollectionBeforeChangeHook = async ({ data, req, operation, originalDoc }) => {
  const draft = data as Json
  const original = asRecord(originalDoc)
  const user = (req as { user?: unknown } | undefined)?.user as Parameters<typeof can>[0]

  for (const field of ['layout', 'publishedLayout'] as const) {
    if (draft[field] === undefined) continue
    if (draft[field] === null) continue
    const clean = sanitiseLayout(parseMaybeJson(draft[field]))
    if (!clean) await throwValidation(field, 'The form layout is not valid, or it is too large.')
    draft[field] = clean
  }

  // The public embed key is minted once and never changed, so a printed or
  // published embed snippet keeps working.
  if (operation === 'create') {
    draft.embedKey = generateEmbedKey()
    if (draft.formStatus === undefined) draft.formStatus = 'draft'
  } else if (typeof original.embedKey === 'string' && original.embedKey) {
    draft.embedKey = original.embedKey
  } else if (!draft.embedKey) {
    draft.embedKey = generateEmbedKey()
  }

  if (draft.formConfig !== undefined) {
    const incoming = normaliseFormConfig(parseMaybeJson(draft.formConfig))
    const previous = normaliseFormConfig(parseMaybeJson(original.formConfig))
    const mayIntegrate = !user || can(user, 'forms.integrations', 'update')

    // Only people trusted with integrations may change what leaves the server or who may embed.
    if (!mayIntegrate) {
      incoming.webhooks = previous.webhooks
      incoming.embed = previous.embed
    } else {
      const previousById = new Map((previous.webhooks || []).map((hook) => [hook.id, hook]))
      const hooks: FormWebhook[] = []
      for (const hook of incoming.webhooks || []) {
        const stored = previousById.get(hook.id)
        let secret = hook.secret || ''
        if (secret === SECRET_MASK) secret = stored?.secret || ''
        if (hook.enabled !== false && hook.url && !isSafeWebhookUrl(hook.url)) {
          await throwValidation('formConfig', `The webhook "${hook.name}" needs a public https:// address.`)
        }
        if (secret && !secret.startsWith('enc:v1:')) secret = encryptSecretHook({ value: secret } as never) as string
        hooks.push({ ...hook, secret })
      }
      incoming.webhooks = hooks
    }
    draft.formConfig = incoming
  }

  return data
}

/**
 * Field-level afterRead on `formConfig`: masks or decrypts webhook secrets.
 * A read that carries a user is an admin-screen read, so it sees the mask. The
 * server's own reads (submission handling, retries) carry no user and get the
 * real secret.
 */
export const formConfigAfterRead: FieldHook = ({ value, req }) => {
  if (!value || typeof value !== 'object') return value
  const config = value as FormConfig
  if (!Array.isArray(config.webhooks)) return value
  const hasUser = Boolean((req as { user?: unknown } | undefined)?.user)
  return {
    ...config,
    webhooks: config.webhooks.map((hook) => ({
      ...hook,
      secret: hasUser ? (hook.secret ? SECRET_MASK : '') : (decryptSecretHook({ value: hook.secret } as never) as string),
    })),
  }
}
