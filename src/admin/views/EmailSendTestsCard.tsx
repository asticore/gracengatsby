'use client'

import React, { useState } from 'react'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { TEMPLATE_LABELS } from '@/features/email/testSamples'
import type { TemplateTestRow } from '@/features/email/testRunSend'
import { postEmailTest, postTestText, type SendAllResponse, type SendOneResponse } from './emailTestingApi'

/** "Send a test" - one template or every template, with the result of each. */

const KEYS = Object.keys(EMAIL_TEMPLATE_DEFAULTS)

type Props = {
  adminEmail: string | null
  testRecipient: string | null
  smsConnected: boolean
  smsLabel: string | null
}

function ResultTable({ rows }: { rows: TemplateTestRow[] }) {
  return (
    <table className="et-table">
      <thead>
        <tr>
          <th scope="col">Email</th>
          <th scope="col">Result</th>
          <th scope="col">Provider</th>
          <th scope="col">Details</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td>
              <span className={row.ok ? 'et-badge et-badge--good' : 'et-badge et-badge--missing'}>
                {row.ok ? 'Sent' : 'Not sent'}
              </span>
            </td>
            <td>{row.provider ?? <span className="et-muted">-</span>}</td>
            <td>{row.ok ? <span className="et-muted">Check the inbox</span> : row.error || row.reason || 'Unknown reason'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function EmailSendTestsCard({ adminEmail, testRecipient, smsConnected, smsLabel }: Props) {
  const [key, setKey] = useState(KEYS[0] ?? '')
  const [to, setTo] = useState(testRecipient || adminEmail || '')
  const [busy, setBusy] = useState<'one' | 'all' | 'text' | null>(null)
  const [rows, setRows] = useState<TemplateTestRow[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const sendOne = async () => {
    setBusy('one')
    setNotice(null)
    const result = await postEmailTest<SendOneResponse>({ action: 'send-one', key, to })
    if (result.ok) {
      setRows([result.data.row])
      setNotice(`Test sent to ${result.data.to}.`)
    } else {
      setRows([])
      setNotice(result.error)
    }
    setBusy(null)
  }

  const sendAll = async () => {
    setBusy('all')
    setNotice(null)
    const result = await postEmailTest<SendAllResponse>({ action: 'send-all', to })
    if (result.ok) {
      setRows(result.data.rows)
      const sent = result.data.rows.filter((row) => row.ok).length
      setNotice(`${sent} of ${result.data.rows.length} tests sent to ${result.data.to}.`)
    } else {
      setRows([])
      setNotice(result.error)
    }
    setBusy(null)
  }

  const sendText = async () => {
    setBusy('text')
    setNotice(null)
    const result = await postTestText()
    setNotice(result.ok ? result.data.message || 'Test text sent.' : result.error)
    setBusy(null)
  }

  return (
    <CollapsibleCard id="email-testing-send" title="Send a test">
      <div className="et-form">
        <label className="et-field">
          <span className="et-label">Email to test</span>
          <select className="et-input" value={key} onChange={(event) => setKey(event.target.value)}>
            {KEYS.map((item) => (
              <option key={item} value={item}>
                {TEMPLATE_LABELS[item] ?? item}
              </option>
            ))}
          </select>
        </label>
        <label className="et-field">
          <span className="et-label">Send tests to</span>
          <input className="et-input" type="email" value={to} onChange={(event) => setTo(event.target.value)} />
          <span className="et-muted">Your own address or the test recipient. Other addresses are refused.</span>
        </label>
        <div className="et-actions">
          <button type="button" className="et-button" onClick={sendOne} disabled={busy !== null || !to}>
            {busy === 'one' ? 'Sending...' : 'Send this test'}
          </button>
          <button type="button" className="et-button et-button--secondary" onClick={sendAll} disabled={busy !== null || !to}>
            {busy === 'all' ? 'Sending all...' : 'Send all templates'}
          </button>
        </div>
      </div>

      {notice && (
        <p className="et-notice" role="status">
          {notice}
        </p>
      )}
      {rows.length > 0 && <ResultTable rows={rows} />}

      {smsConnected && (
        <div className="et-sms-row">
          <p className="et-muted">Text messages are connected through {smsLabel ?? 'your provider'}.</p>
          <button type="button" className="et-button et-button--secondary" onClick={sendText} disabled={busy !== null}>
            {busy === 'text' ? 'Sending...' : 'Send test text'}
          </button>
        </div>
      )}
    </CollapsibleCard>
  )
}
