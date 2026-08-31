import React from 'react'
import type { Metadata } from 'next'

import { OrderScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Your order')
}

export default async function OrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OrderScreen id={id} />
}
