import React from 'react'
import type { Metadata } from 'next'

import { ForgotPasswordScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Forgotten your password')
}

export default async function ForgotPasswordRoute() {
  return <ForgotPasswordScreen />
}
