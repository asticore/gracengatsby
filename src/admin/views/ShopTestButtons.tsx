'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import React, { useState } from 'react'

import { CARRIERS } from '@/features/ecommerce/shipping/catalogue'

type Result = { ok: boolean; message: string }

async function post(url: string, body: unknown): Promise<Result> {
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string }
    if (!res.ok) return { ok: false, message: json.error || 'The test failed.' }
    return { ok: json.ok === true, message: json.message || '' }
  } catch {
    return { ok: false, message: 'Could not reach the server.' }
  }
}

function TestRow({ label, url, body, hint }: { label: string; url: string; body: unknown; hint?: React.ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  return (
    <div className="shop-test-row">
      <button
        type="button"
        className="btn btn--style-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setResult(await post(url, body))
          setBusy(false)
        }}
      >
        {busy ? 'Testing...' : label}
      </button>
      {hint}
      {result && (
        <span role="status" className={result.ok ? 'shop-test-row__ok' : 'shop-test-row__bad'}>
          {result.message}
        </span>
      )}
    </div>
  )
}

/** Shown under the Payments form. Tests the SAVED keys, so save first. */
export const PaymentTestButtons: React.FC = () => (
  <div className="shop-test-panel">
    <h3>Test connections</h3>
    <p>These use the keys you have already saved.</p>
    <TestRow label="Test Stripe" url="/api/admin-shop-payment-test" body={{ provider: 'stripe' }} />
    <TestRow label="Test PayPal" url="/api/admin-shop-payment-test" body={{ provider: 'paypal' }} />
  </div>
)

/** Shown under the Shipping form: one row per carrier with a sign-up link, a keys help link and a test button. */
export const CarrierTestPanel: React.FC = () => (
  <div className="shop-test-panel">
    <h3>Carriers</h3>
    <p>Switch a carrier on and paste its keys above, save, then test. Carriers marked keys only use your zone rates and tracking you type in.</p>
    {CARRIERS.map((c) => (
      <div key={c.id} className="shop-test-carrier">
        <strong>{c.label}</strong> <span>{c.live.rates || c.live.labels ? 'Live calls built in' : 'Keys only'}</span>
        <div>{c.summary}</div>
        <div>
          <a href={c.signupUrl} target="_blank" rel="noopener noreferrer">Get an account</a> | <a href={c.docsUrl} target="_blank" rel="noopener noreferrer">API docs</a> | {c.keysHelp}
        </div>
        <TestRow label={`Test ${c.label}`} url="/api/admin-shop-carrier-test" body={{ carrier: c.id }} />
      </div>
    ))}
    <p>
      <AdminLink path="/shop/shipping-zones">Shipping zones and rates</AdminLink> are the fall-back when a carrier cannot quote. <AdminLink path="/shop/shipping-manifests">Manifests</AdminLink> are listed here too.
    </p>
  </div>
)
