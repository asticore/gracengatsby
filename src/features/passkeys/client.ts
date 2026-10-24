/**
 * Browser side of passkeys: calls navigator.credentials with the options the server
 * issued, and posts the answers back. base64url helpers for the binary fields.
 * Feature-detected: when the browser has no WebAuthn, every call says so and nothing
 * else on the page changes.
 */

export const passkeysSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.credentials

export const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

export const toBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type ApiResult = { ok: boolean; message?: string; redirect?: string; twoFactorRequired?: boolean; pendingToken?: string; [key: string]: unknown }

const postJson = async (url: string, body: unknown): Promise<ApiResult> => {
  try {
    const response = await fetch(url, {
      method: url.endsWith('/list') ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: url.endsWith('/list') ? undefined : JSON.stringify(body ?? {}),
    })
    const data = (await response.json().catch((): null => null)) as ApiResult | null
    return data ?? { ok: false, message: 'Something went wrong. Try again.' }
  } catch {
    return { ok: false, message: 'Could not reach the site. Check your connection and try again.' }
  }
}

const cancelled = (error: unknown): boolean => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')

/** Creates a passkey on this device. `confirm` is the password or the six-digit authenticator code. */
export async function addPasskey(confirm: string, label: string): Promise<ApiResult> {
  if (!passkeysSupported()) return { ok: false, message: 'This browser cannot use passkeys.' }
  const started = await postJson('/api/passkeys/register-options', {})
  if (!started.ok || !started.options) return started
  // Wire-format options from our own server; field types are documented in webauthn.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = started.options as Record<string, any>
  let credential: PublicKeyCredential | null
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: fromBase64Url(o.challenge),
        rp: o.rp,
        user: { id: fromBase64Url(o.user.id), name: o.user.name, displayName: o.user.displayName },
        pubKeyCredParams: o.pubKeyCredParams,
        timeout: o.timeout,
        attestation: 'none',
        authenticatorSelection: o.authenticatorSelection,
        excludeCredentials: (o.excludeCredentials ?? []).map((c: { id: string; transports?: AuthenticatorTransport[] }) => ({
          type: 'public-key' as const,
          id: fromBase64Url(c.id),
          transports: c.transports,
        })),
      },
    })) as PublicKeyCredential | null
  } catch (error) {
    return { ok: false, message: cancelled(error) ? 'Passkey setup was cancelled.' : 'This device could not create a passkey.' }
  }
  if (!credential) return { ok: false, message: 'This device could not create a passkey.' }
  const response = credential.response as AuthenticatorAttestationResponse
  const confirmation = /^\d{6}$/.test(confirm.trim()) ? { code: confirm.trim() } : { password: confirm }
  return postJson('/api/passkeys/register-verify', {
    ...confirmation,
    label,
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
  })
}

/** Signs in with a passkey the device offers. Returns a redirect, or a pending token for the two-step code. */
export async function signInWithPasskey(next: string, area: 'account' | 'admin' = 'account'): Promise<ApiResult> {
  if (!passkeysSupported()) return { ok: false, message: 'This browser cannot use passkeys.' }
  const started = await postJson('/api/passkeys/login-options', {})
  if (!started.ok || !started.options) return started
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = started.options as Record<string, any>
  let credential: PublicKeyCredential | null
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        challenge: fromBase64Url(o.challenge),
        rpId: o.rpId,
        timeout: o.timeout,
        userVerification: o.userVerification,
        allowCredentials: [],
      },
    })) as PublicKeyCredential | null
  } catch (error) {
    return { ok: false, message: cancelled(error) ? 'Passkey sign-in was cancelled.' : 'No passkey was found on this device.' }
  }
  if (!credential) return { ok: false, message: 'No passkey was found on this device.' }
  const response = credential.response as AuthenticatorAssertionResponse
  return postJson('/api/passkeys/login-verify', {
    next,
    area,
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : null,
    },
  })
}

export const renamePasskeyRequest = (id: number, label: string): Promise<ApiResult> => postJson('/api/passkeys/rename', { id, label })
export const removePasskeyRequest = (id: number, confirm: string): Promise<ApiResult> =>
  postJson('/api/passkeys/remove', /^\d{6}$/.test(confirm.trim()) ? { id, code: confirm.trim() } : { id, password: confirm })
export const listPasskeysRequest = (): Promise<ApiResult> => postJson('/api/passkeys/list', {})
