import React from 'react'
import type { Metadata } from 'next'

import { ProfileScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Your profile')
}

export default async function ProfileRoute({
  searchParams,
}: {
  searchParams: Promise<{ social_error?: string; password?: string }>
}) {
  const { social_error: socialError, password } = await searchParams
  return <ProfileScreen socialError={socialError} passwordDue={password === 'due'} />
}
