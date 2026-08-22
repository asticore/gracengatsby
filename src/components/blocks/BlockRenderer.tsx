import React from 'react'

import type { Page } from '@/payload-types'

import { CtaBannerBlock } from './CtaBannerBlock'
import { EventGridBlock } from './EventGridBlock'
import { FaqBlockBlock } from './FaqBlockBlock'
import { GalleryBlock } from './GalleryBlock'
import { HeroBlock } from './HeroBlock'
import { ImageTextBlock } from './ImageTextBlock'
import { ProductGridBlock } from './ProductGridBlock'
import { RichTextBlock } from './RichTextBlock'

type PageBlock = NonNullable<Page['blocks']>[number]

export const BlockRenderer: React.FC<{ block: PageBlock }> = ({ block }) => {
  switch (block.blockType) {
    case 'hero':
      return <HeroBlock {...block} />
    case 'richText':
      return <RichTextBlock content={block.content} />
    case 'imageText':
      return <ImageTextBlock image={block.image} content={block.content} imageSide={block.imageSide} />
    case 'productGrid':
      return <ProductGridBlock heading={block.heading} category={block.category} limit={block.limit} />
    case 'eventGrid':
      return <EventGridBlock heading={block.heading} showPast={block.showPast} limit={block.limit} />
    case 'gallery':
      return <GalleryBlock heading={block.heading} images={block.images} />
    case 'faq':
      return (
        <FaqBlockBlock heading={block.heading} source={block.source} category={block.category} faqs={block.faqs} />
      )
    case 'ctaBanner':
      return (
        <CtaBannerBlock
          heading={block.heading}
          text={block.text}
          buttonLabel={block.buttonLabel}
          buttonUrl={block.buttonUrl}
          style={block.style}
        />
      )
    default:
      return null
  }
}
