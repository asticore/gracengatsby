/**
 * Reads the account e-mail from the id_token that Google returns over TLS at
 * the token endpoint. The token was received directly from Google in the same
 * request, so its claims are used without a signature check (OpenID Connect
 * allows this for tokens from the token endpoint). Returns '' when absent.
 */
export function emailFromIdToken(idToken: unknown): string {
  if (typeof idToken !== 'string') return ''
  const payload = idToken.split('.')[1]
  if (!payload) return ''
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown }
    return typeof claims.email === 'string' ? claims.email.trim().slice(0, 254) : ''
  } catch {
    return ''
  }
}
