import React from 'react'
import type { Metadata } from 'next'

import { requireFeature } from '@/features/accounts'
import { PrivacyConfirm } from '@/features/privacy/components/PrivacyConfirm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Confirm deletion', robots: { index: false, follow: false } }

export default async function PrivacyConfirmRoute({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await requireFeature()
  const { token } = await searchParams
  return <PrivacyConfirm token={typeof token === 'string' ? token : ''} />
}
