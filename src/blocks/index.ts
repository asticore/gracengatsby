import { CtaBannerBlock } from './CtaBanner'
import { EventGridBlock } from './EventGrid'
import { FaqBlock } from './Faq'
import { GalleryBlock } from './Gallery'
import { HeroBlock } from './Hero'
import { ImageTextBlock } from './ImageText'
import { ProductGridBlock } from './ProductGrid'
import { RichTextBlock } from './RichTextBlock'

/** The full page-builder block library, shared by Pages and Page Templates. */
export const pageBuilderBlocks = [
  HeroBlock,
  RichTextBlock,
  ImageTextBlock,
  ProductGridBlock,
  EventGridBlock,
  GalleryBlock,
  FaqBlock,
  CtaBannerBlock,
]
