import React from 'react'

import { redirectIfSignedIn, requireFeature } from '../guards'
import { RESET_TTL_MINUTES } from '../auth'
import { AuthShell } from './AccountShell'
import {
  ForgotPasswordForm,
  RegisterForm,
  ResetPasswordForm,
  SignInForm,
} from './AuthForms'

/**
 * The four screens an unauthenticated visitor can reach.
 *
 * Each one starts with the feature guard, so that with accounts switched off
 * they are 404s rather than pages that explain themselves. The routes under
 * app/(frontend)/account stay one line each because the guard lives with the
 * screen, not with the route.
 */

export const SignInScreen: React.FC<{ next?: string; justReset?: boolean }> = async ({
  next,
  justReset,
}) => {
  await redirectIfSignedIn()

  return (
    <AuthShell title="Sign in">
      <SignInForm next={next && next.startsWith('/account') ? next : '/account'} justReset={justReset} />
    </AuthShell>
  )
}

export const RegisterScreen: React.FC = async () => {
  await redirectIfSignedIn()

  return (
    <AuthShell title="Create an account" intro="Keep track of your orders, addresses and event bookings.">
      <RegisterForm />
    </AuthShell>
  )
}

export const ForgotPasswordScreen: React.FC = async () => {
  await requireFeature()

  return (
    <AuthShell
      title="Forgotten your password"
      intro="Enter your email address and we will send you a link to choose a new password."
    >
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
  await requireFeature()

  if (!token) {
    return (
      <AuthShell title="Choose a new password">
        <p className="account-note account-note--error">
          That link is incomplete. Ask for a new one from the forgotten password page.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      intro={`This link works once, and only within ${RESET_TTL_MINUTES} minutes of being sent.`}
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  )
}
