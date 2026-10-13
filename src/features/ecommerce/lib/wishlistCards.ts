/**
 * Turns database product rows into the four fields the public wishlist endpoint may return:
 * title, slug, price and image. Pure, no I/O. Only published products pass, and the result keeps
 * the order the visitor saved them in.
 */

import { priceRange, type CatalogueProduct } from '../catalogue'

export type WishlistCard = {
  id: number
  title: string
  slug: string
  price: number | null
  image: string | null
}

type Row = Record<string, unknown> & { id?: unknown }

function imageUrl(row: Row): string | null {
  const first = Array.isArray(row.images) ? row.images[0] : null
  if (first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string') {
    return (first as { url: string }).url
  }
  return null
}

export function wishlistCards(rows: Row[], requestedIds: number[]): WishlistCard[] {
  const byId = new Map<number, Row>()
  for (const row of rows) {
    if (typeof row.id !== 'number' || row._status !== 'published') continue
    byId.set(row.id, row)
  }
  const cards: WishlistCard[] = []
  for (const id of requestedIds) {
    const row = byId.get(id)
    if (!row || typeof row.slug !== 'string' || typeof row.title !== 'string') continue
    const range = priceRange(row as unknown as CatalogueProduct)
    const price = range.min ?? (typeof row.priceInAUD === 'number' ? row.priceInAUD : null)
    cards.push({ id, title: row.title, slug: row.slug, price, image: imageUrl(row) })
  }
  return cards
}