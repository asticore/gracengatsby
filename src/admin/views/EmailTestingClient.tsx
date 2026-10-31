'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React from 'react'
import type { ProviderStateSummary } from '@/features/email/providerState'
import { EmailConnectionCard } from './EmailConnectionCard'
import { EmailDomainCard } from './EmailDomainCard'
import { EmailSendTestsCard } from './EmailSendTestsCard'
import './email-testing.css'

type Props = {
  summary: ProviderStateSummary
  smsConnected: boolean
  smsLabel: string | null
  fromEmail: string | null
  testRecipient: string | null
  adminEmail: string | null
}

/** Layout for the Email testing screen. The cards hold the work; this only arranges them. */
export function EmailTestingClient({ summary, smsConnected, smsLabel, fromEmail, testRecipient, adminEmail }: Props) {
  const t = useAdminT()
  return (
    <div className="et-page">
      <header className="et-header">
        <h1 className="et-title">{t('emailTesting.title')}</h1>
        <p className="et-intro">
          Check that email is connected, send a test copy of each automatic email, and check that your sending domain is
          set up. Tests only go to your own address or the test recipient.
        </p>
        <p className="et-muted">
          <AdminLink path="/settings/communication">{t('emailTesting.back')}</AdminLink>
        </p>
      </header>
      <EmailConnectionCard summary={summary} />
      <EmailSendTestsCard
        adminEmail={adminEmail}
        testRecipient={testRecipient}
        smsConnected={smsConnected}
        smsLabel={smsLabel}
      />
      <EmailDomainCard fromEmail={fromEmail} />
    </div>
  )
}
