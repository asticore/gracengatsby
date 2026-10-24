import React from 'react'

import { getGateOptions } from '@/features/visibility/gate'

import './password-gate.css'

/**
 * Shown instead of the content of a protected page, post, product or event.
 * Plain HTML (no client JS): the password form posts to /api/content-unlock, which sets the unlock
 * cookie and redirects back to `currentPath`; the sign-in link goes to /account/sign-in?redirect=.
 * What is offered depends on how the document is protected: its own password or a shared group
 * password (password form), "visible to signed-in accounts" (sign-in link, plus the password form when a group is
 * attached). When the lookup fails the password form is shown alone; the content stays locked either way.
 * Optional `offer` lets a caller that already knows skip the lookup.
 */
export const PasswordGate = async ({
  collection,
  id,
  currentPath,
  wrongPassword = false,
  offer,
}: {
  collection: string
  id: number
  currentPath: string
  wrongPassword?: boolean
  offer?: { signIn: boolean; password: boolean }
}): Promise<React.ReactElement> => {
  const options = offer ?? (await getGateOptions({ collection, id }))
  const showPassword = options.password || !options.signIn
  const signInHref = `/account/sign-in?redirect=${encodeURIComponent(currentPath)}`

  return (
    <div className="pw-gate__wrap">
      <div className="pw-gate__card">
        <h1 className="pw-gate__title">{options.signIn ? 'Sign in to view this' : 'Password protected'}</h1>
        <p className="pw-gate__text">
          {options.signIn && showPassword
            ? 'Sign in with an account that has access, or enter the password.'
            : options.signIn
              ? 'This content is available to signed-in accounts with access. Sign in to continue.'
              : 'This content is password protected. Enter the password to continue.'}
        </p>
        {options.signIn && (
          <a className="pw-gate__signin" href={signInHref}>
            Sign in
          </a>
        )}
        {options.signIn && showPassword && <p className="pw-gate__divider">or</p>}
        {showPassword && wrongPassword && (
          <div className="pw-gate__alert" role="alert">
            Wrong password. Please try again.
          </div>
        )}
        {showPassword && (
          <form action="/api/content-unlock" method="post">
            <input name="collection" type="hidden" value={collection} />
            <input name="id" type="hidden" value={String(id)} />
            <input name="redirect" type="hidden" value={currentPath} />
            <input
              aria-label="Password"
              autoComplete="current-password"
              className="pw-gate__input"
              name="password"
              placeholder="Enter password"
              required
              type="password"
            />
            <button className="pw-gate__button" type="submit">
              Unlock
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
