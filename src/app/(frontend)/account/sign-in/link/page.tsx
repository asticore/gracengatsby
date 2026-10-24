import React from 'react'
import type { Metadata } from 'next'

import { SignInLinkScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Sign in')
}

/**
 * Opening the link only shows a button. Signing in happens when the button is
 * pressed, so an email scanner or link preview that fetches this page cannot use it up.
 */
export default async function SignInLinkRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>
}) {
  const { token, next } = await searchParams
  return <SignInLinkScreen token={token} next={next} />
}
