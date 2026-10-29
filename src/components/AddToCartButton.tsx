'use client'

import { useCart } from '@/engine/commerce/react'
import { useStoreText } from '@/features/uiStrings/StoreTextsContext'
import Link from 'next/link'
import React, { useState } from 'react'

export const AddToCartButton: React.FC<{ productID: number; label?: string }> = ({ productID, label }) => {
  const t = useStoreText()
  const { addItem, isLoading } = useCart()
  const [added, setAdded] = useState(false)

  const handleClick = async () => {
    await addItem({ product: productID }, 1)
    setAdded(true)
  }

  if (added) {
    return (
      <div>
        <p className="mb-3">{t('store.addedToCart')}</p>
        <Link href="/cart" className="btn btn--primary">
          {t('store.viewCart')}
        </Link>
      </div>
    )
  }

  return (
    <button type="button" className="btn btn--primary" onClick={handleClick} disabled={isLoading}>
      {isLoading ? t('store.adding') : (label ?? t('store.addToCart'))}
    </button>
  )
}
