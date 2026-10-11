'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

type Report = {
  dryRun: boolean
  created: number
  updated: number
  failed: number
  errors: Array<{ line: number; message: string }>
  rows: Array<{ line: number; sku: string; action: 'create' | 'update' | 'error' }>
  truncated: boolean
}

/** Export and import of products on the Products list: preview first, then confirm. */
export function ProductsCsvActions() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const exportCsv = async () => {
    setError('')
    const res = await fetch('/api/admin-products-csv', { credentials: 'include' })
    if (!res.ok) {
      setError('Export failed.')
      return
    }
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const send = async (confirm: boolean) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/admin-products-csv${confirm ? '' : '?dryRun=1'}`, { method: 'POST', body: form, credentials: 'include' })
      const body = (await res.json().catch((): null => null)) as (Report & { error?: string }) | null
      if (!res.ok || !body) throw new Error(body?.error || 'Import failed.')
      setReport(body)
      if (confirm) router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={exportCsv} className="list-toolbar-btn" title="Download all products as CSV">
        Export CSV
      </button>
      <div className="list-import-modal">
        <button type="button" onClick={() => { setOpen(!open); setReport(null); setError('') }} className="list-toolbar-btn" title="Import products from CSV">
          Import CSV
        </button>
        {open && (
          <div className="list-import-panel">
            {!report || (!report.dryRun && report) ? (
              <label className="list-import-label">
                <input type="file" accept=".csv,text/csv" className="list-import-input" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null) }} />
                {file ? file.name : 'Choose CSV file (2 MB, 5000 rows at most)'}
              </label>
            ) : null}
            {!report && (
              <button type="button" onClick={() => send(false)} disabled={!file || busy} className="list-import-btn">
                {busy ? 'Checking...' : 'Preview'}
              </button>
            )}
            {report && (
              <div className="list-import-result">
                <p>
                  {report.dryRun ? 'Preview: ' : 'Done: '}
                  {report.created} to create, {report.updated} to update, {report.failed} with errors.
                </p>
                {report.errors.length > 0 && (
                  <ul className="list-import-errors">
                    {report.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e.line ? `Line ${e.line}: ` : ''}{e.message}</li>
                    ))}
                  </ul>
                )}
                {report.dryRun && (
                  <button type="button" onClick={() => send(true)} disabled={busy || report.created + report.updated === 0} className="list-import-btn list-import-btn--confirm">
                    {busy ? 'Importing...' : `Import ${report.created + report.updated} products`}
                  </button>
                )}
                <button type="button" onClick={() => { setReport(null); setFile(null) }} className="list-import-btn">
                  Back
                </button>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        )}
      </div>
    </>
  )
}
