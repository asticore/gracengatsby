'use client'

import { useCart } from '@/engine/commerce/react'
import Link from 'next/link'
import React, { useState } from 'react'

export const AddToCartButton: React.FC<{ productID: number; label?: string }> = ({
  productID,
  label = 'Add to cart',
}) => {
  const { addItem, isLoading } = useCart()
  const [added, setAdded] = useState(false)

  const handleClick = async () => {
    await addItem({ product: productID }, 1)
    setAdded(true)
  }

  if (added) {
    return (
      <div className="add-to-cart-confirm">
        <p>Added to your cart.</p>
        <Link href="/cart" className="btn btn--primary">
          View cart
        </Link>
      </div>
    )
  }

  return (
    <button type="button" className="btn btn--primary" onClick={handleClick} disabled={isLoading}>
      {isLoading ? 'Adding…' : label}
    </button>
  )
}
