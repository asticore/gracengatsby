import type { Engine } from '@/engine'

import { TRACKING_CONNECTIONS_SLUG, type ConnectProvider } from './constants'

/**
 * Reads and writes the `tracking-connections` global. Server only. Secret fields
 * come back decrypted from the engine's field hooks and are never returned to a
 * route response: only the non-secret status (status.ts) leaves this module.
 */

export type ConnectEngine = Pick<Engine, 'findGlobal' | 'updateGlobal'>

export type AppCredentials = { appId: string; appSecret: string }

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export async function readConnectionDoc(engine: ConnectEngine): Promise<Record<string, unknown> | null> {
  try {
    const doc = await engine.findGlobal({ slug: TRACKING_CONNECTIONS_SLUG, depth: 0, overrideAccess: true })
    return (doc as Record<string, unknown> | null) ?? null
  } catch {
    return null
  }
}

/** The app ID and secret the owner saved for one provider. Server use only. */
export async function readAppCredentials(engine: ConnectEngine, provider: ConnectProvider): Promise<AppCredentials | null> {
  const doc = await readConnectionDoc(engine)
  const appId = text(doc?.[`${provider}AppId`])
  const appSecret = text(doc?.[`${provider}AppSecretEnc`])
  if (!appId || !appSecret) return null
  return { appId, appSecret }
}

/** The stored access token for one provider. Server use only. Empty when not connected. */
export async function readAccessToken(engine: ConnectEngine, provider: ConnectProvider): Promise<string> {
  const doc = await readConnectionDoc(engine)
  return text(doc?.[`${provider}AccessTokenEnc`])
}

/** Saves the app credentials. Changing the app ID ends the sign-in, because a token belongs to one app. */
export async function writeAppCredentials(
  engine: ConnectEngine,
  provider: ConnectProvider,
  input: { appId: string; appSecret: string | null },
): Promise<{ signedOut: boolean }> {
  const current = await readConnectionDoc(engine)
  const changed = text(current?.[`${provider}AppId`]) !== input.appId
  const data: Record<string, unknown> = { [`${provider}AppId`]: input.appId }
  if (input.appSecret) data[`${provider}AppSecretEnc`] = input.appSecret
  if (changed) Object.assign(data, clearedFor(provider))
  await engine.updateGlobal({ slug: TRACKING_CONNECTIONS_SLUG, data, overrideAccess: true })
  return { signedOut: changed && Boolean(text(current?.[`${provider}AccessTokenEnc`])) }
}

export async function writeSignIn(
  engine: ConnectEngine,
  provider: ConnectProvider,
  input: { accessToken: string; accountName: string; expiresAt: string | null; now: Date },
): Promise<void> {
  await engine.updateGlobal({
    slug: TRACKING_CONNECTIONS_SLUG,
    data: {
      [`${provider}AccessTokenEnc`]: input.accessToken,
      [`${provider}AccountName`]: input.accountName.slice(0, 200),
      [`${provider}ConnectedAt`]: input.now.toISOString(),
      [`${provider}TokenExpiresAt`]: input.expiresAt ?? '',
      [`${provider}Error`]: '',
    },
    overrideAccess: true,
  })
}

/** Records a short, non-secret reason (for example "refused"), or clears it with an empty string. */
export async function writeError(engine: ConnectEngine, provider: ConnectProvider, reason: string): Promise<void> {
  try {
    await engine.updateGlobal({ slug: TRACKING_CONNECTIONS_SLUG, data: { [`${provider}Error`]: reason }, overrideAccess: true })
  } catch {
    // The screen shows the reason on the next visit; a failed note must not fail the caller.
  }
}

/** Forgets the token and the account for one provider. The app ID and secret are kept, so reconnecting is one click. */
export async function clearSignIn(engine: ConnectEngine, provider: ConnectProvider): Promise<void> {
  await engine.updateGlobal({ slug: TRACKING_CONNECTIONS_SLUG, data: clearedFor(provider), overrideAccess: true })
}

function clearedFor(provider: ConnectProvider): Record<string, string> {
  return {
    [`${provider}AccessTokenEnc`]: '',
    [`${provider}AccountName`]: '',
    [`${provider}ConnectedAt`]: '',
    [`${provider}TokenExpiresAt`]: '',
    [`${provider}Error`]: '',
  }
}
