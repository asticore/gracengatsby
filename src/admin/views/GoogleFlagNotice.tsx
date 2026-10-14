'use client'

import { useSearchParams } from 'next/navigation'

import './google-connection.css'

/** Plain-English text for the short flag the callback and connect routes put in the address. */
const GOOGLE_FLAG_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  connected: { tone: 'ok', text: 'Google is connected. Now choose the Analytics property, Search Console site and other services below.' },
  denied: { tone: 'error', text: 'The Google sign-in was cancelled. Nothing was changed.' },
  forbidden: { tone: 'error', text: 'Only administrators can connect Google.' },
  state: { tone: 'error', text: 'The sign-in could not be checked, so it was stopped for safety. Click Connect with Google again.' },
  'no-client': { tone: 'error', text: 'Save the Client ID and client secret first.' },
  'no-secret': { tone: 'error', text: 'ENGAGE_SECRET is not set on this site, so sign-ins cannot be protected. Set it and try again.' },
  'no-refresh': { tone: 'error', text: 'Google did not send a long-term sign-in. Click Connect with Google again and approve the access asked for.' },
  exchange: { tone: 'error', text: 'Google would not finish the sign-in. Check the Client ID and client secret, then try again.' },
  error: { tone: 'error', text: 'Something went wrong while connecting to Google. Try again.' },
}

/** Shows the result of the last connect attempt once, then the address is left alone. */
export function GoogleFlagNotice() {
  const flag = useSearchParams().get('google') ?? ''
  const message = GOOGLE_FLAG_MESSAGES[flag]
  if (!message) return null
  return (
    <p role="status" className={`google-connection__notice google-connection__notice--${message.tone}`}>
      {message.text}
    </p>
  )
}
