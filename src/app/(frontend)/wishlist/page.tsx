import { storeTexts } from '@/features/uiStrings/storeTextsServer'
import { translateWith } from '@/features/uiStrings/t'
import type { UiStringKey } from '@/features/uiStrings/keys'
import { notFound } from 'next/navigation'
import React from 'react'

import { WishlistList } from '@/components/WishlistList'
import { wishlistEnabled } from '@/features/ecommerce/lib/wishlist'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'

export async function generateMetadata() {
  return buildMetadata({ title: 'Saved for later', path: '/wishlist' })
}

export const dynamic = 'force-dynamic'

export default async function WishlistPage() {
  const dict = await storeTexts()
  const t = (key: UiStringKey) => translateWith(dict, key)
  const flags = await getFeatureFlags()
  if (!flags.ecommerce) notFound()

  const engine = await getEngine()
  const settings = await engine.findGlobal({ slug: 'shop-settings' }).catch((): null => null)
  if (!wishlistEnabled(settings)) notFound()

  return (
    <div className="page-shell">
      <header className="page-header">
        <h1>{t('store.savedForLater')}</h1>
        <p>{t('store.savedOnDevice')}</p>
      </header>
      <WishlistList />
    </div>
  )
}