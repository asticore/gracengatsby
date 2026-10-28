import React from 'react'
import type { Metadata } from 'next'

import { accountTitle } from '@/features/accounts/portalCopy'

import { RegisterScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(await accountTitle('auth.createAccount'))
}

export default async function RegisterRoute() {
  return <RegisterScreen />
}
