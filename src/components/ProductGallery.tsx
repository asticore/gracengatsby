'use client'

import Image from 'next/image'

import { useVariationImage } from './VariationImageProvider'
import { orderGallery } from '@/features/ecommerce/lib/variationImage'

export type GalleryItem = { id: number; url?: string | null; alt?: string | null }

/** The product's gallery. When a variation with its own image is chosen, that image moves to the front. */
export function ProductGallery({ images, title }: { images: GalleryItem[]; title: string }) {
  const { imageUrl } = useVariationImage()
  const ordered = orderGallery(images, imageUrl)
  return (
    <div className="grid gap-4">
      {ordered.length > 0 ? (
        ordered.map((img) => (
          <Image
            key={img.id}
            src={img.url || ''}
            alt={img.alt || title}
            width={800}
            height={1000}
            style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
          />
        ))
      ) : (
        <div className="aspect-[4/5] bg-[image:linear-gradient(135deg,var(--color-cream-dim),var(--color-gold-light))]" aria-hidden />
      )}
    </div>
  )
}
