import { storeTexts } from '@/features/uiStrings/storeTextsServer'
import { translateWith } from '@/features/uiStrings/t'
import type { UiStringKey } from '@/features/uiStrings/keys'
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
  const dict = await storeTexts()
  const t = (key: UiStringKey) => translateWith(dict, key)

  return (
    <div className="page-shell checkout-success">
      <h1>{t('store.thankYou')}</h1>
      <p>{t('store.orderPlaced')}</p>
      {order && <p>{t('store.orderReference')} {order}</p>}
      <Link href="/shop" className="btn btn--primary">
        {t('store.continueShopping')}
      </Link>
    </div>
  )
}
