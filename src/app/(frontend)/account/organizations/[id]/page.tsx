import React from 'react'
import type { Metadata } from 'next'

import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { portalText } from '@/features/multilingual/portalStrings'

import { accountMetadata } from '@/features/accounts'
import { OrganizationDetailScreen } from '@/features/organizations/components/OrganizationScreens'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(portalText('orgs.metaDetail', await currentPortalLocale()))
}

export default async function OrganizationDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OrganizationDetailScreen id={id} />
}
