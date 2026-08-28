import type { CSSProperties } from 'react'

import type { ImageRequest, MediaLike } from './types'

import { getMediaConfig } from './settings'
import { resolveImage } from './url'

/**
 * The one image component the front end should use.
 *
 * WHY A PLAIN <img> AND NOT next/image
 * ------------------------------------
 * next/image routes every source through the Next optimiser at /_next/image,
 * which resizes with `sharp` - the exact thing that does not exist on Workers.
 * Where the optimiser is unavailable it either falls over or passes the file
 * through untouched, and either way it would strip the Cloudflare transform
 * parameters we just put in the URL, or double-transform on top of them.
 *
 * So the resizing is delegated entirely to the edge, and this component's job
 * is the markup around it: correct srcset, correct sizes, intrinsic width and
 * height so nothing reflows, and lazy loading everywhere except the images the
 * caller marks as above the fold.
 *
 * With the media feature off, or the provider set to none, src is the plain R2
 * URL and the srcset is dropped. The picture still appears - it is simply the
 * file as uploaded.
 */

export type EngageImageProps = ImageRequest & {
  /**
   * Accepts an unpopulated relationship (a bare id) so call sites do not each
   * need a type guard - it renders nothing rather than crashing.
   */
  media?: MediaLike | number | string | null
  /** Overrides the alt text stored on the record. Pass '' for decorative images. */
  alt?: string
  className?: string
  style?: CSSProperties
}

export async function EngageImage({
  media,
  alt,
  className,
  style,
  ...request
}: EngageImageProps) {
  if (!media || typeof media !== 'object') return null

  const config = await getMediaConfig()
  const resolved = resolveImage(media, config, request)

  if (!resolved.src) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      src={resolved.src}
      srcSet={resolved.srcSet}
      sizes={resolved.sizes}
      width={resolved.width}
      height={resolved.height}
      alt={alt ?? resolved.alt}
      loading={resolved.loading}
      decoding={resolved.decoding}
      fetchPriority={resolved.fetchPriority}
      className={className}
      style={style}
    />
  )
}
