import React from 'react'
import type { Metadata } from 'next'

import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { portalText } from '@/features/multilingual/portalStrings'

import { BookingsScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(portalText('bookings.title', await currentPortalLocale()))
}

export default async function BookingsRoute() {
  return <BookingsScreen />
}
