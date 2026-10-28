import type { PortalStringKey, PortalTexts } from '@/features/multilingual/portalStrings'
import type { UiStringVars } from '@/features/uiStrings'
import { socialMessage } from '@/features/socialLogin/messages'
import type { PasswordHintSay } from '@/features/security/passwordPolicy'

/**
 * Account messages are written in English by the services (auth, profile,
 * addresses, passwordless, social sign-in). This table maps each of those exact
 * sentences to its `portal.*` key, so the actions can hand the visitor the same
 * sentence in their language. A sentence not in the table is returned unchanged.
 */

const EXACT: Record<string, PortalStringKey> = {
  'Accounts are not available on this site.': 'msg.featureOff',
  'That language is not available on this site.': 'msg.languageInvalid',
  'Your session has ended. Sign in and try again.': 'msg.signedOut',
  'That did not work.': 'msg.didNotWork',
  'The two passwords do not match.': 'msg.passwordsDiffer',
  'That address has been removed.': 'msg.addressRemoved',
  'That address could not be removed.': 'msg.addressNotRemoved',
  'That address could not be found.': 'msg.addressNotFound',
  'That address could not be saved.': 'msg.addressNotSaved',
  'Default address updated.': 'msg.defaultUpdated',
  'Your language has been saved.': 'msg.languageSaved',
  'Your language will follow your browser.': 'msg.languageBrowser',
  'Those details do not match an account.': 'msg.signInFailed',
  'Verify your email first': 'msg.verifyFirst',
  'That link has expired or has already been used.': 'msg.verifyInvalid',
  'That code was not right, or the sign-in took too long. Start again if needed.': 'msg.codeFailed',
  'That reset link is not valid. Ask for a new one.': 'msg.resetInvalid',
  'That reset link has expired or has already been used.': 'msg.resetExpired',
  'That does not look like an email address.': 'msg.notEmail',
  'If that address has an account, we have sent it an email. Check your inbox, and your spam folder.': 'msg.neutralEmail',
  'Thanks. If that address could be used, your account is ready - check your inbox, then sign in.': 'msg.registered',
  'Your email address is confirmed. You can sign in now.': 'msg.emailVerified',
  'That way of signing in is not turned on for this site.': 'msg.passwordlessOff',
  'That sign-in link or code is not valid. It may have expired or been used already. Ask for a new one.': 'msg.linkRefused',
  'Your name has been saved.': 'msg.nameSaved',
  'That is already your email address.': 'msg.sameEmail',
  'That email address cannot be used.': 'msg.emailUnusable',
  'Your email address has been changed.': 'msg.emailChanged',
  'Your password has been changed.': 'msg.passwordChanged',
  'That password could not be saved.': 'msg.passwordNotSaved',
  'That is not your current password.': 'msg.currentWrong',
  'Fill in the name, street, city and country.': 'msg.addressFields',
  'Passkeys are not available on this site.': 'msg.passkeysOff',
  'Sign in first.': 'msg.signInFirst',
  'Passkey setup was cancelled.': 'srv.passkeyCancelledSetup',
  'Passkey sign-in was cancelled.': 'srv.passkeyCancelledSignIn',
  'This device could not create a passkey.': 'srv.passkeyCreateFailed',
  'No passkey was found on this device.': 'srv.passkeyNoneOnDevice',
  'That passkey was not found.': 'srv.passkeyNotFound',
  'Give the passkey a name.': 'srv.passkeyNameMissing',
  'The passkey could not be added. Try again.': 'srv.passkeyAddFailed',
  'Passkeys are not turned on for this site.': 'srv.passkeysOff',
  'Could not reach the site. Check your connection and try again.': 'srv.cannotReach',
  'Two-step sign-in is off.': 'srv.twoStepOff',
  'Two-step sign-in is already switched on.': 'srv.twoStepAlreadyOn',
  'That device will ask for a code next time.': 'srv.askCodeNextTime',
  'That device is already forgotten or could not be found.': 'srv.deviceForgotten',
  'No devices were remembered.': 'srv.noRemembered',
  'Email codes are not turned on for this site.': 'srv.emailCodesOff',
  'That code did not match. Check the time on your phone and try the next code.': 'srv.codeMismatchClock',
  'That code did not match, or it has expired. Ask for a new one.': 'srv.codeMismatchExpired',
  'That password or code was not right.': 'srv.passwordOrCodeWrong',
  'Confirm it is you with your password or your authenticator code first.': 'srv.confirmFirst',
  'Only an administrator can do that.': 'srv.adminOnly',
  'That account is not connected.': 'srv.accountNotConnected',
  'This is the only way you can sign in. Set a password first (use Forgotten your password), then disconnect it.': 'srv.lastSignInWay',
  'Include both upper-case and lower-case letters.': 'pw.mixedCase',
  'Include at least one number.': 'pw.number',
  'Include at least one symbol, such as ! or #.': 'pw.symbol',
  'That password is too common. Choose something less easy to guess.': 'pw.common',
  'Do not use the name part of your email address in the password.': 'pw.emailName',
  'That password has appeared in a known data breach. Choose a different one.': 'pw.breached',
}

type MessageText = (key: PortalStringKey, vars?: UiStringVars) => string

const PATTERNS: Array<[RegExp, (match: RegExpMatchArray, tx: MessageText) => string]> = [
  [
    /^Too many attempts\. Try again in (\d+) minute\(s\)\.$/,
    (match, tx) => tx('msg.tooMany', { minutes: match[1] ?? '' }),
  ],
  [
    /^Choose a password of at least (\d+) characters\.$/,
    (match, tx) => tx('pw.length', { min: match[1] ?? '' }),
  ],
  [
    /^You cannot reuse one of your last (\d+) passwords\.$/,
    (match, tx) => tx('pw.reuse', { count: match[1] ?? '' }),
  ],
  [
    /^(If that address has an account, we have sent it an email\. Check your inbox, and your spam folder\.) You can ask for another in (\d+) seconds\.$/,
    (match, tx) => tx('msg.neutralEmailWait', { notice: tx('msg.neutralEmail'), seconds: match[2] ?? '' }),
  ],
]

/** Returns the visitor's language for an English service message, or the message itself when it is not in the table. */
export function localiseMessage(message: string, tx: MessageText): string {
  if (!message) return message
  if (Object.prototype.hasOwnProperty.call(EXACT, message)) return tx(EXACT[message]!)
  for (const [pattern, build] of PATTERNS) {
    const match = message.match(pattern)
    if (match) return build(match, tx)
  }
  return message
}

const SOCIAL_KEYS: Record<string, PortalStringKey> = {
  denied: 'social.denied',
  state: 'social.state',
  unavailable: 'social.unavailable',
  provider: 'social.provider',
  'rate-limited': 'social.rateLimited',
  'no-email': 'social.noEmail',
  'unverified-email': 'social.unverifiedEmail',
  'unverified-account': 'social.unverifiedAccount',
  'privileged-no-autolink': 'social.privilegedNoAutolink',
  'admin-disabled': 'social.adminDisabled',
  'signup-disabled': 'social.signupDisabled',
  'verify-first': 'msg.verifyFirst',
  'already-linked': 'social.alreadyLinked',
  'not-found': 'social.notFound',
  locked: 'social.notFound',
  linked: 'social.linked',
}

/** The sentence for a social sign-in result code, in the visitor's language. Same fallback as `socialMessage`. */
export function socialMessageText(code: string | null | undefined, tx: PortalTexts): string {
  if (!code) return ''
  if (Object.prototype.hasOwnProperty.call(SOCIAL_KEYS, code)) return tx(SOCIAL_KEYS[code]!)
  return socialMessage(code)
}

/** Hint sentences for the password field, in the visitor's language (see `passwordHint`). */
export const passwordHintSay =
  (tx: PortalTexts): PasswordHintSay =>
  (key, vars) =>
    tx(`pw.${key}` as PortalStringKey, vars)

export type { UiStringVars }
