/**
 * What a person is told when social sign-in does not go through. The route
 * redirects with a short code; the screen maps the code to one of these
 * sentences, so no arbitrary text can be injected through the address bar.
 */

export const SOCIAL_MESSAGES: Record<string, string> = {
  denied: 'The sign-in was cancelled or not allowed. You can try again or use your email and password.',
  state: 'That sign-in link expired or did not start here. Please try again.',
  unavailable: 'That sign-in method is not available right now.',
  provider: 'The sign-in provider could not be reached or did not accept the request. Please try again later.',
  'rate-limited': 'Too many attempts. Please wait a few minutes and try again.',
  'no-email': 'The provider did not share an email address, so we could not match or create an account.',
  'unverified-email':
    'The provider has not verified your email address, so we cannot use it to find or create an account. Verify it with the provider, or sign in with your email and password.',
  'unverified-account':
    'An account with that email exists, but its email address was never confirmed. Sign in with your password, then connect this provider from your profile.',
  'privileged-no-autolink':
    'This email belongs to a staff account. Sign in with your password first, then connect this provider from the Security area.',
  'admin-disabled': 'Staff accounts cannot sign in with a provider on this site.',
  'signup-disabled': 'New accounts cannot be created this way. Sign in with an account you already have.',
  'verify-first': 'Verify your email first',
  'already-linked': 'That provider account is already connected to a different account here.',
  'not-found': 'We could not complete that sign-in.',
  locked: 'We could not complete that sign-in.',
  linked: 'Connected.',
  'test-ok': 'Test sign-in worked.',
}

export const socialMessage = (code: string | null | undefined): string =>
  (code && SOCIAL_MESSAGES[code]) || (code ? SOCIAL_MESSAGES['not-found'] : '')
