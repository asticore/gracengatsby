import { headers } from 'next/headers'

import { impersonatedEmailAction, stopImpersonationAction } from '../actions'
import { isImpersonating } from '../policy'

/**
 * The strip shown at the top of every page of the site while an admin is
 * signed in as a customer. It names the customer and offers Stop. Renders
 * nothing at all otherwise, so ordinary visitors see no change.
 */
export async function ImpersonationBanner() {
  if (!isImpersonating(await headers())) return null
  const email = await impersonatedEmailAction()
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2147483000,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem 1rem',
        padding: '0.6rem 16px',
        background: '#fff3cd',
        color: '#4a3200',
        borderBottom: '1px solid #e0b400',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.95rem',
      }}
    >
      <span>You are viewing as {email ?? 'a customer'}. Changes you make here are made on their account.</span>
      <form action={stopImpersonationAction}>
        <button
          type="submit"
          style={{
            background: '#4a3200',
            color: '#fff',
            border: 0,
            borderRadius: 4,
            padding: '0.4rem 0.9rem',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          Stop
        </button>
      </form>
    </div>
  )
}
