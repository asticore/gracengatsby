import React from 'react'
import type { Metadata } from 'next'

import { accountMetadata } from '@/features/accounts'
import { StoreCreditScreen } from '@/features/accounts/components/StoreCreditScreen'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Store credit')
}

export default async function StoreCreditRoute() {
  return <StoreCreditScreen />
}
