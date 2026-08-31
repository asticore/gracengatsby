import React from 'react'
import type { Metadata } from 'next'

import { RegisterScreen, accountMetadata } from '@/features/accounts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata('Create an account')
}

export default async function RegisterRoute() {
  return <RegisterScreen />
}
