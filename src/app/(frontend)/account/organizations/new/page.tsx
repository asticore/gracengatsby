import React from 'react'
import type { Metadata } from 'next'

import { accountMetadata } from '@/features/accounts'
import { OrganizationCreateScreen } from '@/features/organizations/components/OrganizationScreens'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Create an organization')
}

export default async function OrganizationCreateRoute() {
  return <OrganizationCreateScreen />
}
