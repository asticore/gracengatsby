import { CtaBannerBlock } from './CtaBanner'
import { EventGridBlock } from './EventGrid'
import { FaqBlock } from './Faq'
import { GalleryBlock } from './Gallery'
import { HeroBlock } from './Hero'
import { ImageTextBlock } from './ImageText'
import { LoopBlock } from './Loop'
import { ProductGridBlock } from './ProductGrid'
import { RichTextBlock } from './RichTextBlock'
import { SectionBlock } from './Section'

/**
 * Content blocks - the things that actually draw something. These are what can
 * sit inside a Section's columns, and they are also usable at the top level of
 * a page.
 */
export const contentBlocks = [
  HeroBlock,
  RichTextBlock,
  ImageTextBlock,
  ProductGridBlock,
  EventGridBlock,
  GalleryBlock,
  FaqBlock,
  CtaBannerBlock,
  LoopBlock,
]

/**
 * The full page-builder block library, shared by Pages, Posts, Products and
 * Page Templates. Section is a layout container and only ever appears at the
 * top level of this list - the columns it holds are stored as JSON, so nesting
 * a section inside a section needs no extra CMS schema.
 */
export const pageBuilderBlocks = [SectionBlock, ...contentBlocks]
