import { getGoogleAccessToken, type GoogleEngine } from '../auth'
import { GoogleApiError, googleErrorMessage } from '../fetchJson'
import { requestJson } from '../http'

/**
 * POST with a JSON body to a Google API. G1's googleGet covers GET only, and the Search Console and
 * Analytics Data reports are POST calls. This follows the same rules: a token from getGoogleAccessToken,
 * the shared 10 second timeout, and no token or request body in errors or logs.
 */

export async function googlePost(engine: GoogleEngine, url: string, body: unknown): Promise<unknown> {
  const auth = await getGoogleAccessToken(engine)
  if (auth.ok === false) throw new GoogleApiError(401, auth.message)

  let result
  try {
    result = await requestJson(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    throw new GoogleApiError(timedOut ? 504 : 502, timedOut ? 'Google did not answer in time. Try again.' : 'Could not reach Google. Check the connection and try again.')
  }

  if (!result.ok) throw new GoogleApiError(result.status, googleErrorMessage(result.status, result.body))
  return result.body
}
