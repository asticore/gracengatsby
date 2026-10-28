import React from 'react'
import type { Metadata } from 'next'

import { accountTitle } from '@/features/accounts/portalCopy'

import { VerifyEmailScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(await accountTitle('auth.confirmEmailTitle'))
}

export default async function VerifyEmailRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <VerifyEmailScreen token={token} />
}
