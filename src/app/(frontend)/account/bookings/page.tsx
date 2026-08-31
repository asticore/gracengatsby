import React from 'react'
import type { Metadata } from 'next'

import { BookingsScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Event bookings')
}

export default async function BookingsRoute() {
  return <BookingsScreen />
}
