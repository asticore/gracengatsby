import React from 'react'
import { cookies } from 'next/headers'
import Link from 'next/link'

import { getEngine } from '@/lib/engine'
import { SocialButtons } from '@/features/socialLogin/components/SocialButtons'
import { publicProviders, registerProviders } from '@/features/socialLogin/public'
import { PENDING_COOKIE } from '@/features/socialLogin/http'

import { passwordFormRules } from '@/features/security/passwordCheck'

import { redirectIfSignedIn, requireFeature } from '../guards'
import { RESET_TTL_MINUTES, VERIFY_TTL_HOURS } from '../auth'
import { AuthShell } from './AccountShell'
import {
  ForgotPasswordForm,
  RegisterForm,
  ResetPasswordForm,
  SignInForm,
  SignInLinkForm,
  VerifyEmailForm,
} from './AuthForms'
import { passwordlessDepsFor, passwordlessOptions } from '../passwordlessWiring'
import { passkeySignInAvailable } from '../passkeysWiring'
import { inspectLink, safeLandingPath } from '@/features/passwordless'
import { requestClient } from '../session'
import { accountTexts } from '../portalCopy'
import { passwordHintSay, socialMessageText } from '../messages'

/**
 * The four screens an unauthenticated visitor can reach.
 *
 * Each one starts with the feature guard, so that with accounts switched off
 * they are 404s rather than pages that explain themselves. The routes under
 * app/(frontend)/account stay one line each because the guard lives with the
 * screen, not with the route.
 */

export const SignInScreen: React.FC<{
  next?: string
  justReset?: boolean
  socialError?: string
  social?: string
}> = async ({ next, justReset, socialError, social }) => {
  await redirectIfSignedIn()

  const safeNext = next && next.startsWith('/account') && !next.startsWith('//') ? next : '/account'
  const engine = await getEngine()
  const providers = await publicProviders(engine, 'account')
  // A social sign-in that still needs its two-step code parks the pending token in an HttpOnly cookie.
  const pending = social === '2fa' ? ((await cookies()).get(PENDING_COOKIE)?.value ?? '') : ''
  const tx = await accountTexts()
  const message = socialError ? socialMessageText(socialError, tx) : ''
  // Off unless the owner switched an emailed option on, so an existing site renders exactly as before.
  const passwordless = await passwordlessOptions(engine, 'account')
  // Off unless the owner switched passkeys on. Existing sign-in screens render exactly as before.
  const passkey = await passkeySignInAvailable(engine, 'account')

  return (
    <AuthShell title={tx('auth.signIn')}>
      {message && (
        <p className="account-note account-note--error" role="alert">
          {message}
        </p>
      )}
      <SignInForm next={safeNext} justReset={justReset} initialPendingToken={pending} passwordless={passwordless} passkey={passkey} />
      {!pending && (
        <SocialButtons
          providers={providers}
          next={safeNext}
          area="account"
          verb={tx('common.continueWith')}
          orLabel={tx('common.or')}
        />
      )}
    </AuthShell>
  )
}

export const RegisterScreen: React.FC = async () => {
  await redirectIfSignedIn()

  const engine = await getEngine()
  const providers = await registerProviders(engine)
  const tx = await accountTexts()
  const rules = await passwordFormRules(engine, passwordHintSay(tx))

  return (
    <AuthShell title={tx('auth.createAccount')} intro={tx('auth.createAccountIntro')}>
      <RegisterForm rules={rules} />
      <SocialButtons providers={providers} area="account" verb={tx('common.signUpWith')} orLabel={tx('common.or')} />
    </AuthShell>
  )
}

export const ForgotPasswordScreen: React.FC = async () => {
  await requireFeature()
  const tx = await accountTexts()

  return (
    <AuthShell title={tx('auth.forgotTitle')} intro={tx('auth.forgotIntro')}>
      <ForgotPasswordForm />
    </AuthShell>
  )
}

/**
 * The token arrives in the query string, is never shown, and is only ever
 * handed straight back to the engine to be matched against an unexpired row.
 * An absent or malformed one is answered here rather than by submitting a form
 * that cannot succeed.
 */
export const ResetPasswordScreen: React.FC<{ token?: string }> = async ({ token }) => {
  const { engine } = await requireFeature()
  const tx = await accountTexts()

  if (!token) {
    return (
      <AuthShell title={tx('auth.chooseNewPassword')}>
        <p className="account-note account-note--error">{tx('auth.resetIncomplete')}</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={tx('auth.chooseNewPassword')} intro={tx('auth.resetIntro', { minutes: RESET_TTL_MINUTES })}>
      <ResetPasswordForm token={token} rules={await passwordFormRules(engine, passwordHintSay(tx))} />
    </AuthShell>
  )
}

/**
 * The link in the verification email lands here. Nothing is consumed on load -
 * only on pressing the button - so a mail scanner that opens the link cannot
 * spend the token before the customer does.
 */
export const VerifyEmailScreen: React.FC<{ token?: string }> = async ({ token }) => {
  await requireFeature()
  const tx = await accountTexts()

  if (!token) {
    return (
      <AuthShell title={tx('auth.confirmEmailTitle')}>
        <p className="account-note account-note--error">{tx('auth.verifyIncomplete')}</p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={tx('auth.confirmEmailTitle')} intro={tx('auth.verifyIntro', { hours: VERIFY_TTL_HOURS })}>
      <VerifyEmailForm token={token} />
    </AuthShell>
  )
}

/**
 * The page an emailed sign-in link opens. It only shows the confirm button after
 * checking the link is still good, and does not spend it: the button does that.
 */
export const SignInLinkScreen: React.FC<{ token?: string; next?: string }> = async ({ token, next }) => {
  await requireFeature()

  const landing = safeLandingPath(next)
  const engine = await getEngine()
  const deps = await passwordlessDepsFor(engine, await requestClient())
  const valid = token ? await inspectLink(deps, token) : false
  const tx = await accountTexts()

  if (!valid) {
    return (
      <AuthShell title={tx('auth.signIn')}>
        <p className="account-note account-note--error">{tx('auth.linkNotValid')}</p>
        <p className="account-link-row">
          <Link href="/account/sign-in">{tx('auth.askForNewOne')}</Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={tx('auth.signIn')} intro={tx('auth.confirmItIsYou')}>
      <SignInLinkForm token={token ?? ''} next={landing} />
    </AuthShell>
  )
}

