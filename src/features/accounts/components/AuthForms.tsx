'use client'

import Link from 'next/link'
import React, { useActionState } from 'react'

import {
  confirmLinkAction,
  forgotPasswordAction,
  registerAction,
  requestLoginAction,
  verifyCodeAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signInCodeAction,
  verifyEmailAction,
} from '../actions'
import { IDLE, VERIFY_FIRST_MESSAGE, type ActionState } from '../types'
import { Note, SubmitButton } from './FormBits'
import { PasskeySignInButton } from '@/features/passkeys/components/PasskeySignInButton'

/**
 * The four unauthenticated forms.
 *
 * Each is a thin shell around a server action: the browser holds no logic
 * about who exists, what a password must look like or whether a token is
 * still good. Everything that decides anything runs on the server, and the
 * component only draws whatever sentence comes back.
 */

export const SignInForm: React.FC<{
  next: string
  justReset?: boolean
  initialPendingToken?: string
  passwordless?: { magicLink: boolean; emailCode: boolean }
  /** Passkey sign-in is offered only when the owner switched it on. */
  passkey?: boolean
}> = ({ next, justReset, initialPendingToken, passwordless, passkey }) => {
  const [state, action] = useActionState<ActionState, FormData>(signInAction, IDLE)
  const [passkeyPending, setPasskeyPending] = React.useState('')

  if (state.pendingToken || initialPendingToken || passkeyPending) {
    return <CodeStep pendingToken={state.pendingToken || initialPendingToken || passkeyPending} next={next} />
  }

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
      {passkey && (
        <>
          <p className="account-hint">Or use a passkey on this device.</p>
          <PasskeySignInButton next={next} onTwoFactor={setPasskeyPending} />
        </>
      )}
      <div className="account-link-row">
        <Link href="/account/register">Create an account</Link>
        <Link href="/account/forgot-password">Forgotten your password?</Link>
      </div>
    </form>
    {state.status === 'error' && state.message === VERIFY_FIRST_MESSAGE && <ResendVerificationForm />}
    {passwordless && (passwordless.magicLink || passwordless.emailCode) && (
      <PasswordlessPanel magicLink={passwordless.magicLink} emailCode={passwordless.emailCode} next={next} />
    )}
    </>
  )
}

/** The second step: a code from the authenticator app, or a backup code. */
export const CodeStep: React.FC<{ pendingToken: string; next: string }> = ({ pendingToken, next }) => {
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

/**
 * Emailed sign-in, offered beside the password form when the owner switched it on.
 * Only the enabled options are drawn. After a request the same sentence comes back
 * whether or not the address has an account; a code then gets its own entry step.
 */
export const PasswordlessPanel: React.FC<{ magicLink: boolean; emailCode: boolean; next: string }> = ({ magicLink, emailCode, next }) => {
  const [state, action] = useActionState<ActionState, FormData>(requestLoginAction, IDLE)
  const [email, setEmail] = React.useState('')

  if (state.status === 'success' && state.kind === 'code') {
    return <VerifyCodeForm email={state.email ?? ''} next={next} />
  }
  if (state.status === 'success') {
    return (
      <div className="account-passwordless">
        <Note state={state} />
      </div>
    )
  }

  return (
    <div className="account-passwordless">
      <p className="account-hint">Or sign in without a password.</p>
      <form action={action} className="account-form">
        <input type="hidden" name="next" value={next} />
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <Note state={state} />
        {magicLink && (
          <button type="submit" name="kind" value="link" className="btn btn--style-secondary">
            Email me a sign-in link
          </button>
        )}
        {emailCode && (
          <button type="submit" name="kind" value="code" className="btn btn--style-secondary">
            Email me a code
          </button>
        )}
      </form>
    </div>
  )
}

/** The code step after an emailed code request. A two-step account is then asked for its authenticator code. */
export const VerifyCodeForm: React.FC<{ email: string; next: string }> = ({ email, next }) => {
  const [state, action] = useActionState<ActionState, FormData>(verifyCodeAction, IDLE)

  if (state.pendingToken) return <CodeStep pendingToken={state.pendingToken} next={next} />

  return (
    <form action={action} className="account-form">
      <p>Enter the six-digit code we emailed to you. It works once.</p>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <label>
        Code
        <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required />
      </label>
      <Note state={state} />
      <SubmitButton>Sign in</SubmitButton>
      <div className="account-link-row">
        <Link href="/account/sign-in">Start again</Link>
      </div>
    </form>
  )
}

/**
 * The confirm page for an emailed link. The button is the only thing that spends
 * the link: opening the page, or a scanner fetching it, changes nothing.
 */
export const SignInLinkForm: React.FC<{ token: string; next: string }> = ({ token, next }) => {
  const [state, action] = useActionState<ActionState, FormData>(confirmLinkAction, IDLE)

  if (state.pendingToken) return <CodeStep pendingToken={state.pendingToken} next={next} />

  return (
    <form action={action} className="account-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={next} />
      <p>Press the button to sign in. The link works once.</p>
      <Note state={state} />
      <SubmitButton>Sign me in</SubmitButton>
    </form>
  )
}
