'use client'

import React, { useState } from 'react'

/** "Email me when it is back" on an out-of-stock product. `website` is a honeypot: hidden from people, filled in by bots. */
export function BackInStockForm({ productId }: { productId: number }) {
  const [state, setState] = useState<{ busy: boolean; done: boolean; message: string; error: string }>({ busy: false, done: false, message: '', error: '' })

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setState({ busy: true, done: false, message: '', error: '' })
    try {
      const res = await fetch('/api/shop-back-in-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, email: form.get('email'), website: form.get('website') }),
      })
      const body = (await res.json().catch((): null => null)) as { ok?: boolean; message?: string; errors?: Record<string, string> } | null
      const error = body?.errors?.email || (res.ok ? '' : body?.message || 'Could not save your request.')
      setState({ busy: false, done: Boolean(res.ok && body?.ok), message: body?.message || 'Thank you.', error })
    } catch {
      setState({ busy: false, done: false, message: '', error: 'Could not save your request. Please try again.' })
    }
  }

  if (state.done) return <p role="status">{state.message}</p>

  return (
    <form onSubmit={submit} className="mt-4 grid max-w-[34rem] gap-3">
      <label>
        Email me when it is back
        <input name="email" type="email" required autoComplete="email" className="mt-1 block w-full border border-[var(--color-line)] p-2" />
      </label>
      <div aria-hidden style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <button type="submit" className="btn btn--primary justify-self-start" disabled={state.busy}>
        {state.busy ? 'Saving...' : 'Tell me when it is back'}
      </button>
    </form>
  )
}