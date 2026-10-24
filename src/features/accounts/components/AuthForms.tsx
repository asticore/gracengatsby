'use client'

import Link from 'next/link'
import React, { useActionState } from 'react'

import {
  forgotPasswordAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signInCodeAction,
  verifyEmailAction,
} from '../actions'
import { IDLE, VERIFY_FIRST_MESSAGE, type ActionState } from '../types'
import { Note, SubmitButton } from './FormBits'

/**
 * The four unauthenticated forms.
 *
 * Each is a thin shell around a server action: the browser holds no logic
 * about who exists, what a password must look like or whether a token is
 * still good. Everything that decides anything runs on the server, and the
 * component only draws whatever sentence comes back.
 */

export const SignInForm: React.FC<{ next: string; justReset?: boolean; initialPendingToken?: string }> = ({ next, justReset, initialPendingToken }) => {
  const [state, action] = useActionState<ActionState, FormData>(signInAction, IDLE)

  if (state.pendingToken || initialPendingToken) return <CodeStep pendingToken={state.pendingToken || initialPendingToken || ''} next={next} />

  return (
    <>
    <form action={action} className="account-form">
      {justReset && (
        <p className="account-note account-note--success">
          Your password has been changed. Sign in with it below.
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <Note state={state} />
      <SubmitButton>Sign in</SubmitButton>
      <div className="account-link-row">
        <Link href="/account/register">Create an account</Link>
        <Link href="/account/forgot-password">Forgotten your password?</Link>
      </div>
    </form>
    {state.status === 'error' && state.message === VERIFY_FIRST_MESSAGE && <ResendVerificationForm />}
    </>
  )
}

/** The second step: a code from the authenticator app, or a backup code. */
const CodeStep: React.FC<{ pendingToken: string; next: string }> = ({ pendingToken, next }) => {
  const [state, action] = useActionState<ActionState, FormData>(signInCodeAction, IDLE)

  return (
    <form action={action} className="account-form">
      <p>Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your backup codes instead.</p>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="pendingToken" value={state.pendingToken || pendingToken} />
      <label>
        Code
        <input name="code" type="text" inputMode="text" autoComplete="one-time-code" autoFocus required />
      </label>
      <Note state={state} />
      <SubmitButton>Continue</SubmitButton>
      <div className="account-link-row">
        <Link href="/account/sign-in">Start again</Link>
      </div>
    </form>
  )
}

/** Length floor and the hint line for the password fields, built on the server from the active rules. */
export type PasswordRules = { minLength: number; hint: string }

export const RegisterForm: React.FC<{ rules: PasswordRules }> = ({ rules }) => {
  const [state, action] = useActionState<ActionState, FormData>(registerAction, IDLE)

  // On success the form is replaced by the sentence, because the sentence is
  // deliberately the same whether or not an account was created - leaving the
  // fields on screen would invite a second attempt to tell the two apart.
  if (state.status === 'success') {
    return (
      <div>
        <Note state={state} />
        <p>
          <Link className="btn btn--primary" href="/account/sign-in">
            Go to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="account-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={rules.minLength} required aria-describedby="password-hint" />
      </label>
      <p className="account-hint" id="password-hint">{rules.hint}</p>
      <label>
        Confirm password
        <input
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={rules.minLength}
          required
        />
      </label>
      <Note state={state} />
      <SubmitButton>Create account</SubmitButton>
      <div className="account-link-row">
        <Link href="/account/sign-in">Already have an account?</Link>
      </div>
    </form>
  )
}

export const ForgotPasswordForm: React.FC = () => {
  const [state, action] = useActionState<ActionState, FormData>(forgotPasswordAction, IDLE)

  if (state.status === 'success') return <Note state={state} />

  return (
    <form action={action} className="account-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <Note state={state} />
      <SubmitButton>Email me a reset link</SubmitButton>
      <div className="account-link-row">
        <Link href="/account/sign-in">Back to sign in</Link>
      </div>
    </form>
  )
}

export const ResetPasswordForm: React.FC<{ token: string; rules: PasswordRules }> = ({ token, rules }) => {
  const [state, action] = useActionState<ActionState, FormData>(resetPasswordAction, IDLE)

  return (
    <form action={action} className="account-form">
      <input type="hidden" name="token" value={token} />
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={rules.minLength} required aria-describedby="password-hint" />
      </label>
      <p className="account-hint" id="password-hint">{rules.hint}</p>
      <label>
        Confirm new password
        <input
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={rules.minLength}
          required
        />
      </label>
      <Note state={state} />
      <SubmitButton>Save new password</SubmitButton>
      <div className="account-link-row">
        <Link href="/account/forgot-password">Send me a new link</Link>
      </div>
    </form>
  )
}

export const VerifyEmailForm: React.FC<{ token: string }> = ({ token }) => {
  const [state, action] = useActionState<ActionState, FormData>(verifyEmailAction, IDLE)

  if (state.status === 'success') {
    return (
      <>
        <Note state={state} />
        <div className="account-link-row">
          <Link href="/account/sign-in">Sign in</Link>
        </div>
      </>
    )
  }

  return (
    <form action={action} className="account-form">
      <input type="hidden" name="token" value={token} />
      <Note state={state} />
      <SubmitButton>Confirm my email address</SubmitButton>
    </form>
  )
}

export const ResendVerificationForm: React.FC<{ email?: string }> = ({ email }) => {
  const [state, action] = useActionState<ActionState, FormData>(resendVerificationAction, IDLE)

  if (state.status === 'success') return <Note state={state} />

  return (
    <form action={action} className="account-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={email} required />
      </label>
      <Note state={state} />
      <SubmitButton variant="ghost">Send me a new link</SubmitButton>
    </form>
  )
}
