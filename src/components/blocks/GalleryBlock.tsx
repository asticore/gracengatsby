import Image from 'next/image'
import React from 'react'

import type { Media } from '@/engage-types'

export const GalleryBlock: React.FC<{
  heading?: string | null
  images?: ((number | null) | Media)[] | null
}> = ({ heading, images }) => {
  const media = (images || []).filter((img): img is Media => typeof img === 'object' && img !== null)

  if (media.length === 0) return null

  return (
    <section className="home-section built-block built-block--gallery">
      <div className="page-shell">
        {heading && (
          <div className="section-heading">
            <h2>{heading}</h2>
          </div>
        )}
        <div className="built-block--gallery__grid">
          {media.map((img) => (
            <div key={img.id} className="built-block--gallery__item">
              <Image
                src={img.url || ''}
                alt={img.alt || ''}
                width={600}
                height={600}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
