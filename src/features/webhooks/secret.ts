import { decryptSecretHook, encryptSecretHook } from '@/utilities/secretField'

/**
 * The signing secret at rest: the same AES-256-GCM helpers the API keys and tracking secrets use
 * (keyed off ENGAGE_SECRET). A secret that cannot be read returns '' and the delivery is refused,
 * so a changed ENGAGE_SECRET fails closed: rotate the webhook's secret to fix it.
 */

export const sealSecret = (plain: string): string => {
  const sealed = encryptSecretHook({ value: plain } as never)
  return typeof sealed === 'string' ? sealed : ''
}

export const openSecret = (sealed: string): string => {
  const plain = decryptSecretHook({ value: sealed } as never)
  return typeof plain === 'string' ? plain : ''
}
