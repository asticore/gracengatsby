import React from 'react'
import type { Metadata } from 'next'

import { ResetPasswordScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Choose a new password')
}

export default async function ResetPasswordRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <ResetPasswordScreen token={token} />
}
