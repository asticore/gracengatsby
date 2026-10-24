import React from 'react'
import type { Metadata } from 'next'

import { VerifyEmailScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Confirm your email')
}

export default async function VerifyEmailRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <VerifyEmailScreen token={token} />
}
