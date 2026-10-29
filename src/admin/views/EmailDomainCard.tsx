'use client'

import React, { useState } from 'react'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { CheckLevel, CheckLine } from '@/features/email/dnsCheck'
import { postEmailTest, type DnsResponse } from './emailTestingApi'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'

/** "Is the From domain set up?" - SPF and DMARC looked up live, DKIM as provider instructions. */

const LEVEL_KEY: Record<CheckLevel, UiStringKey> = {
  good: 'ig.lit.lvl_good',
  'needs-work': 'ig.lit.lvl_needs_work',
  missing: 'ig.lit.lvl_missing',
  info: 'ig.lit.lvl_info',
}

const LEVEL_CLASS: Record<CheckLevel, string> = {
  good: 'et-badge et-badge--good',
  'needs-work': 'et-badge et-badge--missing',
  missing: 'et-badge et-badge--missing',
  info: 'et-badge',
}

function CheckRow({ check }: { check: CheckLine }) {
  const t = useAdminT()
  return (
    <tr>
      <td>{check.label}</td>
      <td>
        <span className={LEVEL_CLASS[check.level]}>{t(LEVEL_KEY[check.level])}</span>
      </td>
      <td>{check.message}</td>
    </tr>
  )
}

export function EmailDomainCard({ fromEmail }: { fromEmail: string | null }) {
  const t = useAdminT()
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
    <CollapsibleCard id="email-testing-domain" title={t('ig.lit.dom_title')}>
      <p className="et-muted">
        {fromEmail ? t('ig.lit.dom_checking', { email: fromEmail }) : t('ig.lit.dom_no_from')}
      </p>
      <div className="et-actions">
        <button type="button" className="et-button" onClick={check} disabled={busy || !fromEmail}>
          {busy ? t('ig.lit.dom_check_busy') : t('ig.lit.dom_check')}
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
              ? t('ig.lit.dom_failed', { domain: report.domain })
              : report.overall === 'good'
                ? t('ig.lit.dom_ok', { domain: report.domain })
                : t('ig.lit.dom_attention', { domain: report.domain })}
          </p>
          <table className="et-table">
            <thead>
              <tr>
                <th scope="col">{t('ig.lit.col_record')}</th>
                <th scope="col">{t('ig.lit.col_result')}</th>
                <th scope="col">{t('ig.lit.col_what')}</th>
              </tr>
            </thead>
            <tbody>
              <CheckRow check={report.spf} />
              <CheckRow check={report.dmarc} />
              <CheckRow check={report.dkim} />
            </tbody>
          </table>
          <p className="et-muted">{t('ig.lit.dom_mx_note')}</p>
        </>
      )}
    </CollapsibleCard>
  )
}
