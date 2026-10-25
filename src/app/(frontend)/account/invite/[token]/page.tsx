import React from 'react'
import type { Metadata } from 'next'

import { accountMetadata } from '@/features/accounts'
import { AcceptInviteScreen } from '@/features/organizations/components/OrganizationScreens'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  // The title never carries the token or the organisation, and the page is kept out of search results by accountMetadata.
  return { ...(await accountMetadata('Invitation')), referrer: 'no-referrer' }
}

export default async function AcceptInviteRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AcceptInviteScreen token={decodeURIComponent(token)} />
}
