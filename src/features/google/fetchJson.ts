import { getGoogleAccessToken, type GoogleEngine } from './auth'
import { requestJson } from './http'

/** A failed Google call. The message is plain English and never includes a token. */
export class GoogleApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
  }
}

/** Google's own error text when it sent one, otherwise a plain-English line for the status. */
export function googleErrorMessage(status: number, body: unknown): string {
  const inner = (body as { error?: { message?: unknown } } | null)?.error?.message
  if (typeof inner === 'string' && inner.trim()) return inner.trim().slice(0, 300)
  if (status === 401) return 'Google refused the sign-in. Click Connect with Google again.'
  if (status === 403) {
    return 'Google refused this request. The signed-in account may not have access to it, or the API may be switched off in Google Cloud.'
  }
  if (status === 404) return 'Google could not find that item.'
  if (status === 429) return 'Google is busy right now. Try again in a few minutes.'
  return `Google answered with an error (status ${status}). Try again later.`
}

/**
 * GET a Google API with the saved sign-in. Throws GoogleApiError on any
 * failure, including "not connected" (status 401) and a timeout (status 504).
 */
export async function googleGet<T = unknown>(
  engine: GoogleEngine,
  url: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const auth = await getGoogleAccessToken(engine)
  if ('message' in auth) throw new GoogleApiError(401, auth.message)

  const target = new URL(url)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) target.searchParams.set(key, String(value))
  }

  let result
  try {
    result = await requestJson(target.toString(), {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    throw new GoogleApiError(timedOut ? 504 : 502, timedOut ? 'Google did not answer in time. Try again.' : 'Could not reach Google. Check the connection and try again.')
  }

  if (!result.ok) throw new GoogleApiError(result.status, googleErrorMessage(result.status, result.body))
  return result.body as T
}
