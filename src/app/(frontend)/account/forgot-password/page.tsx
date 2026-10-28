import React from 'react'
import type { Metadata } from 'next'

import { accountTitle } from '@/features/accounts/portalCopy'

import { ForgotPasswordScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata(await accountTitle('auth.forgotTitle'))
}

export default async function ForgotPasswordRoute() {
  return <ForgotPasswordScreen />
}
