import React from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { CtaBannerBlock } from './CtaBannerBlock'
import { EventGridBlock } from './EventGridBlock'
import { FaqBlockBlock } from './FaqBlockBlock'
import { GalleryBlock } from './GalleryBlock'
import { HeroBlock } from './HeroBlock'
import { ImageTextBlock } from './ImageTextBlock'
import { LoopBlock } from './LoopBlock'
import { ProductGridBlock } from './ProductGridBlock'
import { RichTextBlock } from './RichTextBlock'
import { SectionBlock } from './SectionBlock'
import { StyledBlock } from './StyledBlock'

/**
 * Renders one block's own markup, without the Design wrapper.
 *
 * Typed against the loose SectionNode shape rather than the generated Page
 * block union, because the exact same renderer has to serve three callers: the
 * top-level blocks of a page (typed), the blocks nested inside a Section's JSON
 * column (untyped), and a template's blocks after merge tags have been
 * substituted (also untyped). Field access is defensive throughout.
 */
export const renderBlockBody = (block: SectionNode, key: string): React.ReactNode => {
  const get = <T,>(name: string): T => block[name] as T

  switch (block.blockType) {
    case 'section':
      return <SectionBlock columns={block.columns} renderNode={renderBlockBody} />

    case 'loop':
      return (
        <LoopBlock
          heading={get('heading')}
          template={get('template')}
          source={get('source')}
          category={get('category')}
          limit={get('limit')}
          columns={get('columns')}
          sortBy={get('sortBy')}
          renderNode={renderBlockBody}
        />
      )

    case 'hero':
      return (
        <HeroBlock
          heading={get('heading')}
          subheading={get('subheading')}
          backgroundImage={get('backgroundImage')}
          primaryCtaLabel={get('primaryCtaLabel')}
          primaryCtaUrl={get('primaryCtaUrl')}
          secondaryCtaLabel={get('secondaryCtaLabel')}
          secondaryCtaUrl={get('secondaryCtaUrl')}
        />
      )

    case 'richText':
      return <RichTextBlock content={get('content')} />

    case 'imageText':
      return <ImageTextBlock image={get('image')} content={get('content')} imageSide={get('imageSide')} />

    case 'productGrid':
      return <ProductGridBlock heading={get('heading')} category={get('category')} limit={get('limit')} />

    case 'eventGrid':
      return <EventGridBlock heading={get('heading')} showPast={get('showPast')} limit={get('limit')} />

    case 'gallery':
      return <GalleryBlock heading={get('heading')} images={get('images')} />

    case 'faq':
      return (
        <FaqBlockBlock
          heading={get('heading')}
          source={get('source')}
          category={get('category')}
          faqs={get('faqs')}
        />
      )

    case 'ctaBanner':
      return (
        <CtaBannerBlock
          heading={get('heading')}
          text={get('text')}
          buttonLabel={get('buttonLabel')}
          buttonUrl={get('buttonUrl')}
          style={get('style')}
        />
      )

    default:
      return null
  }
}

/**
 * Renders a top-level page block, wrapped in its Design settings.
 * `index` scopes the block's responsive CSS to a unique DOM id.
 */
export const BlockRenderer: React.FC<{ block: unknown; index?: number }> = ({ block, index = 0 }) => {
  const node = block as SectionNode
  if (!node || typeof node.blockType !== 'string') return null

  return (
    <StyledBlock style={node.design} index={index}>
      {renderBlockBody(node, String(index))}
    </StyledBlock>
  )
}
