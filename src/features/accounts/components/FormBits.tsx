'use client'

import React from 'react'
import { useFormStatus } from 'react-dom'

import type { ActionState } from '../types'

/**
 * The two pieces every form on these screens shares.
 *
 * `useFormStatus` reads the pending state of the form it sits inside, so a
 * submit button knows it is submitting without any of its own state - which
 * matters here because these forms post to server actions and re-render from
 * the server, not from a client-side store.
 */

export const SubmitButton: React.FC<{ children: React.ReactNode; variant?: 'primary' | 'ghost' }> = ({
  children,
  variant = 'primary',
}) => {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`btn btn--${variant}`} disabled={pending}>
      {pending ? 'Working…' : children}
    </button>
  )
}

export const Note: React.FC<{ state: ActionState }> = ({ state }) => {
  if (state.status === 'idle' || !state.message) return null
  return (
    <p
      className={`account-note account-note--${state.status}`}
      // Announced when it appears, so someone using a screen reader hears the
      // outcome of a submit instead of having to go looking for it.
      role="status"
      aria-live="polite"
    >
      {state.message}
    </p>
  )
}
