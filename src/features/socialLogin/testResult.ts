import { PROVIDERS, isProviderId, type ProviderId } from './providers'

/**
 * Reads the `?social_test=<provider>:ok|fail:<detail>` flag the admin test
 * flow returns with, and says it in a sentence. Pure, so it is tested.
 */

const FAIL_REASONS: Record<string, string> = {
  unavailable: 'the credentials are not all saved yet',
  denied: 'the sign-in was cancelled or the provider refused it',
  state: 'the sign-in took too long or did not start from this browser',
  exchange: 'the provider rejected the code exchange - check the client ID, secret and redirect URL',
  network: 'the provider could not be reached',
  'bad-credentials': 'the credentials could not be used (check the Apple key)',
  'no-id-token': 'the provider did not return an identity token',
  'no-access-token': 'the provider did not return an access token',
  'no-profile': 'the provider did not return a profile',
  'token-audience': 'the identity token was issued for a different client ID',
  'token-issuer': 'the identity token came from an unexpected issuer',
  'token-nonce': 'the identity token did not match this sign-in',
  'token-expired': 'the identity token had expired',
  'token-signature': 'the identity token signature did not verify',
}

export function socialTestSummary(search: string, provider: ProviderId): string | null {
  const raw = new URLSearchParams(search).get('social_test')
  if (!raw) return null
  const [id, outcome, detail = ''] = raw.split(':')
  if (id !== provider || !isProviderId(id)) return null
  const label = PROVIDERS[id].label
  if (outcome === 'ok') {
    const note =
      detail === 'email-verified'
        ? ' The provider reports a verified email.'
        : detail === 'email-unverified'
          ? ' The provider did not confirm the email is verified, so it could not be used to match or create accounts.'
          : detail === 'no-email'
            ? ' The provider shared no email address.'
            : ''
    return `${label} test worked.${note}`
  }
  const reason = FAIL_REASONS[detail] ?? (detail ? `reason: ${detail.replace(/[^a-z0-9-]/gi, '').slice(0, 40)}` : 'unknown reason')
  return `${label} test failed: ${reason}.`
}

