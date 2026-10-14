import React from 'react'
import type { Metadata } from 'next'

import { accountMetadata } from '@/features/accounts'
import { MySubscriptionsScreen } from '@/features/ecommerce/subscriptions/components/MySubscriptionsScreen'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('My subscriptions')
}

export default async function SubscriptionsRoute({ searchParams }: { searchParams: Promise<{ started?: string }> }) {
  const params = await searchParams
  return <MySubscriptionsScreen started={params.started === '1'} />
}
