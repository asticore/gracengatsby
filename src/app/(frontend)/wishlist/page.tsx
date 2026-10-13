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
  const flags = await getFeatureFlags()
  if (!flags.ecommerce) notFound()

  const engine = await getEngine()
  const settings = await engine.findGlobal({ slug: 'shop-settings' }).catch((): null => null)
  if (!wishlistEnabled(settings)) notFound()

  return (
    <div className="page-shell">
      <header className="page-header">
        <h1>Saved for later</h1>
        <p>Pieces you have saved on this device.</p>
      </header>
      <WishlistList />
    </div>
  )
}