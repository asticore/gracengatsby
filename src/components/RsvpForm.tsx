'use client'

import React, { useState } from 'react'

export const RsvpForm: React.FC<{ eventID: string | number }> = ({ eventID }) => {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('submitting')
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    try {
      const res = await fetch('/api/event-rsvps', {
        body: JSON.stringify({
          email: formData.get('email'),
          event: eventID,
          guestCount: Number(formData.get('guestCount')) || 1,
          name: formData.get('name'),
          notes: formData.get('notes') || undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!res.ok) {
        const body = (await res.json().catch((): null => null)) as {
          errors?: { message: string }[]
        } | null
        throw new Error(body?.errors?.[0]?.message || 'Something went wrong. Please try again.')
      }

      setStatus('success')
      form.reset()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const inputClassName =
    'border border-[var(--color-line)] bg-[var(--color-cream)] p-3 font-[family-name:var(--font-body)] text-base'
  const labelClassName = 'flex flex-col gap-1.5 text-[0.85rem] uppercase tracking-[0.06em]'

  if (status === 'success') {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="mb-2">You&apos;re on the list.</h3>
        <p>We&apos;ve saved your RSVP - see you there.</p>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <h3>RSVP</h3>
      <label className={labelClassName}>
        Name
        <input name="name" type="text" required className={inputClassName} />
      </label>
      <label className={labelClassName}>
        Email
        <input name="email" type="email" required className={inputClassName} />
      </label>
      <label className={labelClassName}>
        Guests (including yourself)
        <input name="guestCount" type="number" min={1} defaultValue={1} className={inputClassName} />
      </label>
      <label className={labelClassName}>
        Notes (optional)
        <textarea name="notes" rows={3} className={inputClassName} />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Reserve my spot'}
      </button>
    </form>
  )
}
