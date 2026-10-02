'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useFormFields } from '@/admin/context'

// Helper functions exported for testing
export function isSmallImage(width?: number, height?: number): boolean {
  if (!width || !height) return false
  return width < 1200 || height < 630
}

export type ImageSource = 'socialImage' | 'featuredImage' | 'siteDefault'

export function pickImageSource(
  ogImage: unknown,
  xImage: unknown,
  featuredImage: unknown,
  isXImage: boolean
): ImageSource | null {
  const hasOgImage = !!ogImage
  const hasXImage = !!xImage
  const hasFeaturedImage = !!featuredImage

  if (isXImage) {
    if (hasXImage) return 'socialImage'
    if (hasOgImage) return 'socialImage'
    if (hasFeaturedImage) return 'featuredImage'
    return 'siteDefault'
  }

  // For social image (Facebook/LinkedIn/Slack)
  if (hasOgImage) return 'socialImage'
  if (hasFeaturedImage) return 'featuredImage'
  return 'siteDefault'
}

export function getNoticeText(
  source: ImageSource | null,
  isXImage: boolean
): string {
  const platform = isXImage ? 'X' : 'Shared on Facebook, LinkedIn and Slack'
  const sourceLabel = getSourceLabel(source)

  if (isXImage) {
    return `X uses: ${sourceLabel}`
  }

  return `${platform} using: ${sourceLabel}`
}

function getSourceLabel(source: ImageSource | null): string {
  switch (source) {
    case 'socialImage':
      return 'the social image'
    case 'featuredImage':
      return 'the featured image'
    case 'siteDefault':
      return 'the site default image'
    default:
      return 'none set'
  }
}

type MediaObject = {
  id: string
  filename?: string
  url?: string
  mimeType?: string
  alt?: string
  width?: number
  height?: number
}

async function fetchMedia(
  id: string | number | MediaObject
): Promise<MediaObject | null> {
  const mediaId = typeof id === 'object' ? id.id : id
  const numId = typeof mediaId === 'string' ? mediaId : String(mediaId)

  try {
    const res = await fetch(`/api/media/${numId}?depth=0`, {
      credentials: 'include',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export const SocialImageInfo: React.FC = () => {
  const [ogImageData, setOgImageData] = useState<MediaObject | null>(null)
  const [xImageData, setXImageData] = useState<MediaObject | null>(null)
  const mediaCache = useRef<Map<string, MediaObject | null>>(new Map())

  const { ogImage, xImage, featuredImage } = useFormFields(([fields]) => ({
    ogImage: fields['seo.ogImage']?.value as unknown,
    xImage: fields['seo.xImage']?.value as unknown,
    featuredImage: fields['featuredImage']?.value as unknown,
  }))

  // Fetch og image data
  useEffect(() => {
    if (!ogImage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing cache when image unset is safe
      setOgImageData(null)
      return
    }

    const mediaId = typeof ogImage === 'object' && ogImage !== null && 'id' in ogImage ? String((ogImage as MediaObject).id) : String(ogImage)

    if (mediaCache.current.has(mediaId)) {
      const cached = mediaCache.current.get(mediaId)
      setOgImageData(cached)
      return
    }

    const typedOgImage = ogImage as string | number | MediaObject
    let cancelled = false
    fetchMedia(typedOgImage).then((data) => {
      mediaCache.current.set(mediaId, data)
      if (!cancelled) setOgImageData(data)
    })
    return () => {
      cancelled = true
    }
  }, [ogImage])

  // Fetch x image data
  useEffect(() => {
    if (!xImage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing cache when image unset is safe
      setXImageData(null)
      return
    }

    const mediaId = typeof xImage === 'object' && xImage !== null && 'id' in xImage ? String((xImage as MediaObject).id) : String(xImage)

    if (mediaCache.current.has(mediaId)) {
      const cached = mediaCache.current.get(mediaId)
      setXImageData(cached)
      return
    }

    const typedXImage = xImage as string | number | MediaObject
    let cancelled = false
    fetchMedia(typedXImage).then((data) => {
      mediaCache.current.set(mediaId, data)
      if (!cancelled) setXImageData(data)
    })
    return () => {
      cancelled = true
    }
  }, [xImage])

  const ogImageSource = pickImageSource(ogImage, xImage, featuredImage, false)
  const xImageSource = pickImageSource(ogImage, xImage, featuredImage, true)

  const displayOgImage = ogImageData || (ogImage && typeof ogImage === 'object' ? (ogImage as MediaObject) : null)
  const displayXImage = xImageData || (xImage && typeof xImage === 'object' ? (xImage as MediaObject) : null)

  return (
    <div className="seo-image-info">
      {/* Social Image Preview */}
      {displayOgImage && (
        <div className="seo-image-section">
          <h3 className="seo-image-section-title">Social Image Preview</h3>
          <ImagePreview media={displayOgImage} />
          {displayOgImage && isSmallImage(displayOgImage.width, displayOgImage.height) && (
            <div className="seo-image-warn">
              This image is {displayOgImage?.width} x {displayOgImage?.height} px. 1200 x 630 px or larger looks best when shared.
            </div>
          )}
        </div>
      )}

      {/* X Image Preview */}
      {displayXImage && (
        <div className="seo-image-section">
          <h3 className="seo-image-section-title">X Image Preview</h3>
          <ImagePreview media={displayXImage} />
          {displayXImage && isSmallImage(displayXImage.width, displayXImage.height) && (
            <div className="seo-image-warn">
              This image is {displayXImage?.width} x {displayXImage?.height} px. 1200 x 630 px or larger looks best when shared.
            </div>
          )}
        </div>
      )}

      {/* Usage Notes */}
      <div className="seo-image-notes">
        <div className="seo-image-note">
          {getNoticeText(ogImageSource, false)}
        </div>
        <div className="seo-image-note">
          {getNoticeText(xImageSource, true)}
        </div>
      </div>
    </div>
  )
}

interface ImagePreviewProps {
  media: MediaObject
}

function ImagePreview({ media }: ImagePreviewProps) {
  // Try to build a URL if we have an ID; otherwise skip the image
  const url = media.url || undefined

  return (
    <div className="seo-image-preview">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- small admin preview doesn't need Image optimization
        <img
          src={url}
          alt={media.alt || media.filename || 'Social preview image'}
          style={{ maxWidth: '160px', objectFit: 'cover' }}
        />
      )}
      {media.width && media.height && (
        <div className="seo-image-size">{media.width} x {media.height} px</div>
      )}
    </div>
  )
}
