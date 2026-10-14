import { GOOGLE_CONNECTION_SLUG } from './constants'
import { clearGoogleTokenCache, readGoogleDoc, type GoogleEngine } from './auth'

/**
 * Writes to the google-connection global: the client the owner created, the
 * sign-in that Google returned, and the disconnect. Validation is here, on the
 * server, so a hand-made request cannot store a malformed value.
 */

/** Only Google's own client IDs are accepted. */
const CLIENT_ID = /^[0-9A-Za-z._-]{10,200}\.apps\.googleusercontent\.com$/

/** The client secret, printable ASCII without spaces. Google's secrets look like GOCSPX-... */
const CLIENT_SECRET = /^[!-~]{8,200}$/

/** Account-specific choices. Cleared together when the account changes. */
export const PICK_FIELDS = [
  'ga4PropertyId',
  'ga4MeasurementId',
  'searchConsoleSite',
  'gtmAccountId',
  'gtmContainerId',
  'adsenseAccountId',
  'adsensePublisherId',
] as const

const clearedPicks = (): Record<string, string> => Object.fromEntries(PICK_FIELDS.map((field) => [field, '']))

export type ClientInput = { ok: true; clientId: string; clientSecret: string | null } | { ok: false; error: string }

/** Checks the client form. An empty secret means "keep the saved one". */
export function validateClientInput(body: unknown): ClientInput {
  const raw = (body ?? {}) as { clientId?: unknown; clientSecret?: unknown }
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : ''
  if (!CLIENT_ID.test(clientId)) {
    return { ok: false, error: 'The Client ID should end in .apps.googleusercontent.com. Copy it from Google Cloud Console.' }
  }
  const secret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : ''
  if (secret && !CLIENT_SECRET.test(secret)) {
    return { ok: false, error: 'The client secret has spaces or is too short. Copy it again from Google Cloud Console.' }
  }
  return { ok: true, clientId, clientSecret: secret || null }
}

/** Saves the client. Changing the client ID ends the sign-in, because a refresh token belongs to one client. */
export async function saveClient(engine: GoogleEngine, input: { clientId: string; clientSecret: string | null }): Promise<{ signedOut: boolean }> {
  const current = await readGoogleDoc(engine)
  const changedClient = (typeof current?.clientId === 'string' ? current.clientId.trim() : '') !== input.clientId
  const data: Record<string, unknown> = { clientId: input.clientId }
  if (input.clientSecret) data.clientSecretEnc = input.clientSecret
  if (changedClient) {
    Object.assign(data, {
      refreshTokenEnc: '',
      connectedEmail: '',
      connectedAt: '',
      scopesGranted: '',
      lastError: '',
      ...clearedPicks(),
    })
    clearGoogleTokenCache()
  }
  await engine.updateGlobal({ slug: GOOGLE_CONNECTION_SLUG, data, overrideAccess: true })
  return { signedOut: changedClient && Boolean(current?.refreshTokenEnc) }
}

/** Stores the sign-in that the callback just received. Picks from an earlier account are cleared. */
export async function saveSignIn(
  engine: GoogleEngine,
  input: { refreshToken: string; email: string; scopes: string; now?: Date },
): Promise<void> {
  clearGoogleTokenCache()
  await engine.updateGlobal({
    slug: GOOGLE_CONNECTION_SLUG,
    data: {
      refreshTokenEnc: input.refreshToken,
      connectedEmail: input.email,
      connectedAt: (input.now ?? new Date()).toISOString(),
      scopesGranted: input.scopes,
      lastError: '',
      ...clearedPicks(),
    },
    overrideAccess: true,
  })
}

/** Forgets the sign-in and every choice. The client ID and secret are kept, so reconnecting is one click. */
export async function clearSignIn(engine: GoogleEngine): Promise<void> {
  clearGoogleTokenCache()
  await engine.updateGlobal({
    slug: GOOGLE_CONNECTION_SLUG,
    data: {
      refreshTokenEnc: '',
      connectedEmail: '',
      connectedAt: '',
      scopesGranted: '',
      lastError: '',
      ...clearedPicks(),
    },
    overrideAccess: true,
  })
}
