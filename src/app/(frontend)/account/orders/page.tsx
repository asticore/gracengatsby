import React from 'react'
import type { Metadata } from 'next'

import { OrdersScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Your orders')
}

export default async function OrdersRoute() {
  return <OrdersScreen />
}
