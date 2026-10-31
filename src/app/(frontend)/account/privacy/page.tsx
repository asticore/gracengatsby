import React from 'react'
import type { Metadata } from 'next'

import { accountMetadata } from '@/features/accounts'
import { PrivacyScreen } from '@/features/privacy/components/PrivacyScreen'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Your data')
}

export default async function PrivacyRoute({ searchParams }: { searchParams: Promise<{ deletion?: string }> }) {
  const { deletion } = await searchParams
  return <PrivacyScreen deletion={deletion} />
}
