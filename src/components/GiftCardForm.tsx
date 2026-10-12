'use client'

import { useCart } from '@/engine/commerce/react'
import Link from 'next/link'
import React, { useState } from 'react'

export type GiftCardConfig = { presets: number[]; allowCustom: boolean; min: number; max: number }

const input = 'w-full border border-[var(--color-line)] p-2'
const label = 'mb-3 block text-[0.85rem]'

/**
 * Buy a gift card: pick an amount, say who it is for, add a message, and optionally choose the day it is emailed.
 * The server checks the amount against the shop's settings and the recipient details again when the card is added.
 */
export function GiftCardForm({ productId, config }: { productId: number; config: GiftCardConfig }) {
  const { addItem, isLoading } = useCart()
  const [preset, setPreset] = useState<number | 'custom'>(config.presets[0] ?? 'custom')
  const [custom, setCustom] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sender, setSender] = useState('')
  const [message, setMessage] = useState('')
  const [sendOn, setSendOn] = useState('')
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)

  const dollars = preset === 'custom' ? Number(custom) : preset
  const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setAdded(false)
    const failure = await addItem(
      {
        product: productId,
        customAmount: cents,
        giftName: name,
        giftEmail: email,
        giftSenderName: sender,
        giftMessage: message,
        giftSendAt: sendOn ? new Date(`${sendOn}T08:00:00`).toISOString() : '',
      },
      1,
    )
    if (failure) setError(failure)
    else setAdded(true)
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <fieldset className="mb-3">
        <legend className="mb-1 text-[0.85rem] uppercase tracking-[0.06em]">Amount</legend>
        <div className="flex flex-wrap gap-2">
          {config.presets.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="radio" name="gift-amount" checked={preset === p} onChange={() => setPreset(p)} /> ${p}
            </label>
          ))}
          {config.allowCustom && (
            <label className="flex items-center gap-1">
              <input type="radio" name="gift-amount" checked={preset === 'custom'} onChange={() => setPreset('custom')} /> Other
            </label>
          )}
        </div>
        {config.allowCustom && preset === 'custom' && (
          <input type="number" min={config.min} max={config.max} step="1" className={`${input} mt-2`} placeholder={`$${config.min} to $${config.max}`} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Gift card amount in dollars" />
        )}
      </fieldset>
      <label className={label}>
        Recipient name
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>
        Recipient email *
        <input type="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className={label}>
        From
        <input className={input} value={sender} onChange={(e) => setSender(e.target.value)} />
      </label>
      <label className={label}>
        Message
        <textarea className={input} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className={label}>
        Send on (optional)
        <input type="date" className={input} value={sendOn} onChange={(e) => setSendOn(e.target.value)} />
        <span className="opacity-70">Leave blank to email it as soon as your order is paid.</span>
      </label>
      <button type="submit" className="btn btn--primary" disabled={isLoading || cents <= 0}>
        {isLoading ? 'Adding...' : 'Add gift card to cart'}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[0.9rem] text-[#b3261e]">
          {error}
        </p>
      ) : null}
      {added && !error ? (
        <p role="status" className="mt-2">
          Added to your cart. <Link href="/cart">View cart</Link>
        </p>
      ) : null}
    </form>
  )
}
