'use client'

import React, { useState } from 'react'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { CheckLevel, CheckLine } from '@/features/email/dnsCheck'
import { postEmailTest, type DnsResponse } from './emailTestingApi'

/** "Is the From domain set up?" - SPF and DMARC looked up live, DKIM as provider instructions. */

const LEVEL_LABEL: Record<CheckLevel, string> = {
  good: 'Good',
  'needs-work': 'Needs work',
  missing: 'Missing',
  info: 'For information',
}

const LEVEL_CLASS: Record<CheckLevel, string> = {
  good: 'et-badge et-badge--good',
  'needs-work': 'et-badge et-badge--missing',
  missing: 'et-badge et-badge--missing',
  info: 'et-badge',
}

function CheckRow({ check }: { check: CheckLine }) {
  return (
    <tr>
      <td>{check.label}</td>
      <td>
        <span className={LEVEL_CLASS[check.level]}>{LEVEL_LABEL[check.level]}</span>
      </td>
      <td>{check.message}</td>
    </tr>
  )
}

export function EmailDomainCard({ fromEmail }: { fromEmail: string | null }) {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<DnsResponse['report'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = async () => {
    setBusy(true)
    setError(null)
    const result = await postEmailTest<DnsResponse>({ action: 'dns' })
    if (result.ok) {
      setReport(result.data.report)
      if (result.data.report.lookupError) setError(result.data.report.lookupError)
    } else {
      setReport(null)
      setError(result.error)
    }
    setBusy(false)
  }

  return (
    <CollapsibleCard id="email-testing-domain" title="Is the sending domain set up?">
      <p className="et-muted">
        {fromEmail ? `Checking the domain of ${fromEmail}.` : 'No From address is set yet. Add one under Sender and testing.'}
      </p>
      <div className="et-actions">
        <button type="button" className="et-button" onClick={check} disabled={busy || !fromEmail}>
          {busy ? 'Checking...' : 'Check domain'}
        </button>
      </div>
      {error && (
        <p className="et-notice" role="status">
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="et-headline">
            {report.lookupError
              ? `The check for ${report.domain} did not finish.`
              : report.overall === 'good'
                ? `${report.domain} has SPF and DMARC records.`
                : `${report.domain} needs attention before mail is reliably delivered.`}
          </p>
          <table className="et-table">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Result</th>
                <th scope="col">What to do</th>
              </tr>
            </thead>
            <tbody>
              <CheckRow check={report.spf} />
              <CheckRow check={report.dmarc} />
              <CheckRow check={report.dkim} />
            </tbody>
          </table>
          <p className="et-muted">MX records are not needed for sending, so they are not checked.</p>
        </>
      )}
    </CollapsibleCard>
  )
}
