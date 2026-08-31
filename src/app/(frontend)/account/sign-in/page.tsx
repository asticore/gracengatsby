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
  searchParams: Promise<{ next?: string; reset?: string }>
}) {
  const { next, reset } = await searchParams
  return <SignInScreen next={next} justReset={reset === '1'} />
}
