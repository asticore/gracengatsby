import Image from 'next/image'
import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'

import type { Media, Page } from '@/payload-types'

type ImageTextBlockData = Extract<NonNullable<Page['blocks']>[number], { blockType: 'imageText' }>

export const ImageTextBlock: React.FC<{
  image: ImageTextBlockData['image']
  content: ImageTextBlockData['content']
  imageSide?: ImageTextBlockData['imageSide']
}> = ({ image, content, imageSide }) => {
  const media = image && typeof image === 'object' ? (image as Media) : null

  return (
    <section
      className={`built-block built-block--imagetext ${
        imageSide === 'right' ? 'built-block--imagetext-reverse' : ''
      }`}
    >
      <div className="page-shell built-block--imagetext__inner">
        <div className="built-block--imagetext__image">
          {media?.url ? (
            <Image src={media.url} alt={media.alt || ''} width={800} height={800} style={{ width: '100%', height: 'auto' }} />
          ) : (
            <div className="product-page__placeholder" aria-hidden />
          )}
        </div>
        <div className="built-block--imagetext__content">{content && <RichText data={content} />}</div>
      </div>
    </section>
  )
}
