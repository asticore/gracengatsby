import React from 'react'
import type { Metadata } from 'next'

import { accountMetadata } from '@/features/accounts'
import { OrganizationsListScreen } from '@/features/organizations/components/OrganizationScreens'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Organizations')
}

export default async function OrganizationsRoute() {
  return <OrganizationsListScreen />
}
