'use client'

import React, { useState } from 'react'

/** Public review form. `website` is a honeypot: hidden from people, filled in by bots. */
export function ProductReviewForm({ productId }: { productId: number }) {
  const [state, setState] = useState<{ busy: boolean; done: boolean; message: string; errors: Record<string, string> }>({ busy: false, done: false, message: '', errors: {} })

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setState({ busy: true, done: false, message: '', errors: {} })
    try {
      const res = await fetch('/api/product-reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productId,
          name: form.get('name'),
          email: form.get('email'),
          rating: Number(form.get('rating')),
          text: form.get('text'),
          website: form.get('website'),
        }),
      })
      const body = (await res.json().catch((): null => null)) as { ok?: boolean; message?: string; errors?: Record<string, string> } | null
      setState({ busy: false, done: Boolean(res.ok && body?.ok), message: body?.message || (res.ok ? 'Thank you.' : 'Could not send your review.'), errors: body?.errors ?? {} })
    } catch {
      setState({ busy: false, done: false, message: 'Could not send your review. Please try again.', errors: {} })
    }
  }

  if (state.done) return <p role="status">{state.message}</p>

  const error = (field: string) => (state.errors[field] ? <span role="alert" className="block text-[0.85rem] text-[#b3261e]">{state.errors[field]}</span> : null)

  return (
    <form onSubmit={submit} className="grid max-w-[34rem] gap-3">
      <label>
        Rating
        <select name="rating" defaultValue="5" className="mt-1 block w-full border border-[var(--color-line)] p-2">
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} star{value === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        {error('rating')}
      </label>
      <label>
        Your name
        <input name="name" maxLength={80} required className="mt-1 block w-full border border-[var(--color-line)] p-2" />
        {error('name')}
      </label>
      <label>
        Email (never shown)
        <input name="email" type="email" required className="mt-1 block w-full border border-[var(--color-line)] p-2" />
        {error('email')}
      </label>
      <label>
        Your review
        <textarea name="text" rows={4} maxLength={4000} required className="mt-1 block w-full border border-[var(--color-line)] p-2" />
        {error('text')}
      </label>
      <div aria-hidden style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.message ? <p role="alert">{state.message}</p> : null}
      <button type="submit" className="btn btn--primary justify-self-start" disabled={state.busy}>
        {state.busy ? 'Sending...' : 'Submit review'}
      </button>
    </form>
  )
}
