import React from 'react'
import type { Metadata } from 'next'

import { AccountHomeScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Your account')
}

export default async function AccountRoute() {
  return <AccountHomeScreen />
}
