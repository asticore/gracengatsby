import Image from 'next/image'
import React from 'react'
import { RichText } from '@/engine/editor/react'

import type { Media, Page } from '@/engage-types'

type ImageTextBlockData = Extract<NonNullable<Page['blocks']>[number], { blockType: 'imageText' }>

export const ImageTextBlock: React.FC<{
  image: ImageTextBlockData['image']
  content: ImageTextBlockData['content']
  imageSide?: ImageTextBlockData['imageSide']
}> = ({ image, content, imageSide }) => {
  const media = image && typeof image === 'object' ? (image as Media) : null
  const isReverse = imageSide === 'right'

  return (
    <section className="built-block">
      <div
        className={`mx-auto grid max-w-[var(--max-width)] grid-cols-2 items-center gap-12 px-6 py-16 max-[900px]:grid-cols-1 ${
          isReverse ? '[direction:rtl] max-[900px]:[direction:ltr]' : ''
        }`}
      >
        <div>
          {media?.url ? (
            <Image src={media.url} alt={media.alt || ''} width={800} height={800} style={{ width: '100%', height: 'auto' }} />
          ) : (
            <div
              className="aspect-[4/5] bg-[image:linear-gradient(135deg,var(--color-cream-dim),var(--color-gold-light))]"
              aria-hidden
            />
          )}
        </div>
        <div className={isReverse ? '[direction:ltr]' : undefined}>{content && <RichText data={content} />}</div>
      </div>
    </section>
  )
}
