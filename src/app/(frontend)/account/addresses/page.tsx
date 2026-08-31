import React from 'react'
import type { Metadata } from 'next'

import { AddressesScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Saved addresses')
}

export default async function AddressesRoute() {
  return <AddressesScreen />
}
