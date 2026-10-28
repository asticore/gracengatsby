import React from 'react'
import type { Metadata } from 'next'

import { accountTitle } from '@/features/accounts/portalCopy'

import { AddressEditScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(await accountTitle('addresses.editTitle'))
}

export default async function AddressEditRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AddressEditScreen id={id} />
}
