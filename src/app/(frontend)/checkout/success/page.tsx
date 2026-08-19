import Link from 'next/link'
import React from 'react'

export const metadata = {
  title: 'Order confirmed | Grace & Gatsby',
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order } = await searchParams

  return (
    <div className="page-shell checkout-success">
      <h1>Thank you!</h1>
      <p>Your order has been placed.</p>
      {order && <p>Order reference: {order}</p>}
      <Link href="/shop" className="btn btn--primary">
        Continue shopping
      </Link>
    </div>
  )
}
