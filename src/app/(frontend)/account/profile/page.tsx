import React from 'react'
import type { Metadata } from 'next'

import { ProfileScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Your profile')
}

export default async function ProfileRoute() {
  return <ProfileScreen />
}
