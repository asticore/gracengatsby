import React from 'react'
import type { Metadata } from 'next'

import { SignInScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Sign in')
}

export default async function SignInRoute({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect?: string; reset?: string; social_error?: string; social?: string }>
}) {
  const { next: nextParam, redirect, reset, social_error: socialError, social } = await searchParams
  // `redirect` is what the protected-content gate sends; both go through the same safe-path check on submit.
  const next = nextParam ?? redirect
  return <SignInScreen next={next} justReset={reset === '1'} socialError={socialError} social={social} />
}
