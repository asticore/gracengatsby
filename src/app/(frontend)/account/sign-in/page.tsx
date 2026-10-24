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
  searchParams: Promise<{ next?: string; reset?: string; social_error?: string; social?: string }>
}) {
  const { next, reset, social_error: socialError, social } = await searchParams
  return <SignInScreen next={next} justReset={reset === '1'} socialError={socialError} social={social} />
}
