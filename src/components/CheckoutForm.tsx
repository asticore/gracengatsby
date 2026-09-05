'use client'

import { useAddresses, useCart, usePayments } from '@/engine/commerce/react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useRouter } from 'next/navigation'
import React, { useMemo, useState } from 'react'

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''

type InitiatePaymentResult = {
  clientSecret?: string
  message?: string
}

const CheckoutInner: React.FC<{ stripePromise: Promise<Stripe | null> }> = ({ stripePromise }) => {
  const { cart } = useCart()
  const { addresses } = useAddresses()
  const { initiatePayment, confirmOrder, isLoading } = usePayments()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const hasItems = (cart?.items?.length || 0) > 0

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError('Please enter your email address.')
      return
    }

    try {
      const result = (await initiatePayment('stripe', {
        additionalData: {
          billingAddress: addresses?.[0],
          customerEmail: email,
          shippingAddress: addresses?.[0],
        },
      })) as InitiatePaymentResult

      if (!result?.clientSecret) {
        throw new Error(result?.message || 'Unable to start checkout.')
      }

      setClientSecret(result.clientSecret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.')
    }
  }

  const handlePay = async (stripe: Stripe, elements: ReturnType<typeof useElements>) => {
    if (!elements) return
    setSubmitting(true)
    setError(null)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      confirmParams: {
        payment_method_data: { billing_details: { email } },
      },
      elements,
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message || 'Payment failed.')
      setSubmitting(false)
      return
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      try {
        const order = (await confirmOrder('stripe', {
          additionalData: {
            customerEmail: email,
            paymentIntentID: paymentIntent.id,
          },
        })) as { orderID?: string }

        router.push(`/checkout/success${order?.orderID ? `?order=${order.orderID}` : ''}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment succeeded but the order could not be confirmed.')
      }
    }

    setSubmitting(false)
  }

  if (!hasItems) {
    return <p>Your cart is empty.</p>
  }

  if (!clientSecret) {
    return (
      <form className="flex flex-col gap-4" onSubmit={handleInitiate}>
        <label className="flex flex-col gap-1.5 text-[0.85rem] uppercase tracking-[0.06em]">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border border-[var(--color-line)] bg-[var(--color-cream)] p-3 font-[family-name:var(--font-body)] text-base"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={isLoading}>
          {isLoading ? 'Preparing checkout…' : 'Continue to payment'}
        </button>
      </form>
    )
  }

  return (
    <Elements options={{ clientSecret }} stripe={stripePromise}>
      <PaymentStep email={email} error={error} onPay={handlePay} submitting={submitting} />
    </Elements>
  )
}

const PaymentStep: React.FC<{
  email: string
  error: string | null
  submitting: boolean
  onPay: (stripe: Stripe, elements: ReturnType<typeof useElements>) => void
}> = ({ error, onPay, submitting }) => {
  const stripe = useStripe()
  const elements = useElements()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe) return
    onPay(stripe, elements)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={!stripe || submitting}>
        {submitting ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  )
}

export const CheckoutForm: React.FC = () => {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)),
    [],
  )

  if (!publishableKey) {
    return (
      <p className="form-error">
        Online payments aren&apos;t connected yet - add a Stripe publishable key to enable checkout.
      </p>
    )
  }

  return <CheckoutInner stripePromise={stripePromise} />
}
