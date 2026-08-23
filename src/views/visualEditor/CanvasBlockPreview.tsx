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
 * Renders an on-brand preview of each block inside the visual editor canvas.
 *
 * Purely presentational blocks (hero, rich text, image+text, gallery, CTA
 * banner) reuse the exact same components the live site renders, so what you
 * see here is what ships. The data-driven blocks (product grid, event grid,
 * FAQ, loop) show a labelled placeholder instead: rendering them for real would
 * mean pulling server-only data-fetching code into the browser bundle, and the
 * placeholder still communicates position and size, which is what the canvas
 * is for.
 *
 * Sections are NOT handled here - the canvas renders their columns itself so
 * the blocks inside stay individually selectable.
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
    case 'gallery':
      return <GalleryPreview data={data} />
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
    case 'productGrid':
      return <DynamicPlaceholder icon="🛍️" label="Product Grid" data={data} detail={gridDetail(data, 'products')} />
    case 'eventGrid':
      return <DynamicPlaceholder icon="📅" label="Event Grid" data={data} detail={gridDetail(data, 'events')} />
    case 'faq':
      return <DynamicPlaceholder icon="❓" label="FAQ" data={data} detail="Pulls in your FAQ entries." />
    case 'loop':
      return <LoopPlaceholder data={data} />
    default:
      return <div className="ve-unknown-block">Unknown block type: {blockType}</div>
  }
}

const gridDetail = (data: Record<string, unknown>, noun: string): string => {
  const limit = typeof data.limit === 'number' ? data.limit : null
  const category = typeof data.category === 'string' && data.category ? data.category : null
  return [limit ? `${limit} ${noun}` : `All ${noun}`, category ? `in ${category}` : null]
    .filter(Boolean)
    .join(' ')
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

/** Loop shows a mini grid of ghost cards so the column count reads at a glance. */
const LoopPlaceholder: React.FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const columns = Math.min(Math.max(typeof data.columns === 'number' ? data.columns : 3, 1), 6)
  const source = typeof data.source === 'string' ? data.source : 'products'
  const hasTemplate = Boolean(data.template)

  return (
    <div className="ve-loop-preview">
      <div className="ve-loop-preview__head">
        <span className="ve-loop-preview__icon">🔁</span>
        <div>
          <strong>{(data.heading as string) || 'Loop'}</strong>
          <p>
            {hasTemplate
              ? `One card per item from ${source}, using the chosen template.`
              : 'Pick a card template in the panel to finish setting this up.'}
          </p>
        </div>
      </div>
      <div className="ve-loop-preview__grid" style={{ ['--loop-columns' as string]: String(columns) }}>
        {Array.from({ length: Math.min(columns * 2, 6) }, (_, i) => (
          <div className="ve-loop-preview__card" key={i} />
        ))}
      </div>
    </div>
  )
}

const DynamicPlaceholder: React.FC<{
  icon: string
  label: string
  data: Record<string, unknown>
  detail?: string
}> = ({ icon, label, data, detail }) => (
  <div className="ve-dynamic-placeholder">
    <div className="ve-dynamic-placeholder__icon">{icon}</div>
    <div>
      <strong>{(data.heading as string) || label}</strong>
      <p>{detail || 'Shows live data on the real page - this canvas just shows where the block sits.'}</p>
    </div>
  </div>
)
