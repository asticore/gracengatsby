'use client'

import React from 'react'

import { CtaBannerBlock } from '@/components/blocks/CtaBannerBlock'
import { GalleryBlock } from '@/components/blocks/GalleryBlock'
import { HeroBlock } from '@/components/blocks/HeroBlock'
import { ImageTextBlock } from '@/components/blocks/ImageTextBlock'
import { RichTextBlock } from '@/components/blocks/RichTextBlock'

import type { Media } from '@/payload-types'

import { useResolvedMedia, useResolvedMediaList } from './useResolvedMedia'

/**
 * Renders a real, on-brand preview of each block inside the visual editor
 * canvas. Purely presentational blocks (hero, rich text, image+text,
 * gallery, CTA banner) reuse the exact same components the live site
 * renders, so what you see here is what ships. The three data-driven
 * blocks (product grid, event grid, FAQ) fetch live data too, but keep
 * their own simplified card markup to avoid pulling server-only code into
 * the browser bundle.
 */
export const CanvasBlockPreview: React.FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const blockType = data.blockType as string

  switch (blockType) {
    case 'hero':
      return <HeroPreview data={data} />
    case 'richText':
      return <RichTextBlock content={data.content as never} />
    case 'imageText':
      return <ImageTextPreview data={data} />
    case 'productGrid':
      return <DynamicPlaceholder icon="🛍️" label="Product Grid" data={data} descField="category" />
    case 'eventGrid':
      return <DynamicPlaceholder icon="📅" label="Event Grid" data={data} />
    case 'gallery':
      return <GalleryPreview data={data} />
    case 'faq':
      return <DynamicPlaceholder icon="❓" label="FAQ" data={data} />
    case 'ctaBanner':
      return (
        <CtaBannerBlock
          heading={(data.heading as string) || 'New call to action'}
          text={data.text as string}
          buttonLabel={data.buttonLabel as string}
          buttonUrl={data.buttonUrl as string}
          style={(data.style as 'dark' | 'light') || 'dark'}
        />
      )
    default:
      return <div className="ve-unknown-block">Unknown block type: {blockType}</div>
  }
}

const HeroPreview: React.FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const media = useResolvedMedia(typeof data.backgroundImage === 'number' ? data.backgroundImage : null)
  return (
    <HeroBlock
      heading={(data.heading as string) || 'New heading'}
      subheading={data.subheading as string}
      backgroundImage={(media as Media) || undefined}
      primaryCtaLabel={data.primaryCtaLabel as string}
      primaryCtaUrl={data.primaryCtaUrl as string}
      secondaryCtaLabel={data.secondaryCtaLabel as string}
      secondaryCtaUrl={data.secondaryCtaUrl as string}
    />
  )
}

const ImageTextPreview: React.FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const media = useResolvedMedia(typeof data.image === 'number' ? data.image : null)
  return (
    <ImageTextBlock
      image={(media as Media) || undefined}
      content={data.content as never}
      imageSide={data.imageSide as 'left' | 'right'}
    />
  )
}

const GalleryPreview: React.FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const ids = Array.isArray(data.images) ? (data.images as number[]) : []
  const media = useResolvedMediaList(ids)
  return <GalleryBlock heading={data.heading as string} images={media as Media[]} />
}

const DynamicPlaceholder: React.FC<{
  icon: string
  label: string
  data: Record<string, unknown>
  descField?: string
}> = ({ icon, label, data }) => (
  <div className="ve-dynamic-placeholder">
    <div className="ve-dynamic-placeholder__icon">{icon}</div>
    <div>
      <strong>{(data.heading as string) || label}</strong>
      <p>Shows live data on the real page - this canvas just shows where the block sits.</p>
    </div>
  </div>
)
