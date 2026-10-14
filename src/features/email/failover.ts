import type { EmailSettingsDoc, EmailProviderKey, OutgoingEmail, ProviderResponse, SendEmailResult } from './types'

import { isSupportedProvider, resolveProvider } from './providers'

/**
 * Choosing and trying providers (wave 16): the default first, then the fallback
 * only when the default failed for a reason that another provider might not
 * share. Pure apart from the send functions it is handed, so it can be tested
 * with fake senders.
 */

export type SendAttempt = {
  provider: EmailProviderKey
  send: (message: OutgoingEmail) => Promise<ProviderResponse>
}

/**
 * A failure worth trying the fallback for: the provider could not be reached,
 * is rate limiting us, or had a server error. A refusal that would repeat with
 * any provider (a bad address, a rejected key, a 4xx) is not transient, so it
 * is returned as it is rather than hidden behind a second send.
 */
export function isTransientFailure(response: ProviderResponse): boolean {
  if (response.ok) return false
  const status = response.status
  if (status === undefined || status === null) return true
  return status === 429 || status >= 500
}

/**
 * The providers to try, in order. The default must be connected; without it
 * nothing is sent and `missing` says what is still blank. The fallback is
 * included only when it is a real, different, connected provider.
 */
export function planAttempts(settings: EmailSettingsDoc): { attempts: SendAttempt[]; missing: string[] } {
  const primary = typeof settings.provider === 'string' ? settings.provider.trim() : ''
  if (!isSupportedProvider(primary)) return { attempts: [], missing: [] }

  const first = resolveProvider(primary, settings)
  if (!first.send) return { attempts: [], missing: first.missing }

  const attempts: SendAttempt[] = [{ provider: primary, send: first.send }]

  const fallback = typeof settings.fallbackProvider === 'string' ? settings.fallbackProvider.trim() : ''
  if (fallback && fallback !== 'none' && fallback !== primary && isSupportedProvider(fallback)) {
    const second = resolveProvider(fallback, settings)
    if (second.send) attempts.push({ provider: fallback, send: second.send })
  }

  return { attempts, missing: [] }
}

/**
 * Runs the attempts in order. Stops at the first success; moves on only when
 * the failure is transient. A send function that throws is treated as a
 * transient failure with its message, so nothing escapes to the caller.
 */
export async function sendWithFailover(
  message: OutgoingEmail,
  attempts: SendAttempt[],
): Promise<SendEmailResult> {
  let last: SendEmailResult = {
    ok: false,
    reason: 'not-configured',
    error: 'No email provider is connected.',
  }

  for (const attempt of attempts) {
    let response: ProviderResponse
    try {
      response = await attempt.send(message)
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    if (response.ok) return { ok: true, provider: attempt.provider, id: response.id }

    last = {
      ok: false,
      reason: 'provider-rejected',
      provider: attempt.provider,
      error: response.error,
      status: response.status,
    }
    if (!isTransientFailure(response)) return last
  }

  return last
}
