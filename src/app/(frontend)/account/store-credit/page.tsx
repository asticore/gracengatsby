import React from 'react'
import type { Metadata } from 'next'

import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { portalText } from '@/features/multilingual/portalStrings'

import { accountMetadata } from '@/features/accounts'
import { StoreCreditScreen } from '@/features/accounts/components/StoreCreditScreen'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(portalText('storeCredit.title', await currentPortalLocale()))
}

export default async function StoreCreditRoute() {
  return <StoreCreditScreen />
}
