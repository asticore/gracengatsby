import React from 'react'

import { isSafeMediaUrl } from '@/lib/blockStyle'

/**
 * Background video layer for a block with bgType 'video'.
 *
 * Plain markup, no client JS: a muted, inline, looping <video> that starts on its own. preload is
 * "none" so the browser fetches nothing up front beyond what autoplay needs. The poster is also
 * set as the wrapper's background (blockStyleToCss), so reduced-motion visitors (the layer is
 * hidden in effects.css) still see an image. Renders nothing when the URL fails validation.
 *
 * Usage (StyledBlock.tsx and Canvas.tsx): <BgVideo src={s.bgVideoUrl} poster={s.bgVideoPoster} loop={s.bgVideoLoop} />
 */
export const BgVideo: React.FC<{
  src?: string | null
  poster?: string | null
  /** Default true. */
  loop?: boolean
}> = ({ src, poster, loop = true }) => {
  if (!isSafeMediaUrl(src, 'video')) return null
  const type = /\.webm(\?|$)/i.test(src) ? 'video/webm' : 'video/mp4'
  const safePoster = isSafeMediaUrl(poster, 'image') ? poster : undefined
  return (
    <video
      className="be-fx be-fx--video"
      aria-hidden="true"
      autoPlay
      muted
      loop={loop}
      playsInline
      preload="none"
      poster={safePoster}
    >
      <source src={src} type={type} />
    </video>
  )
}
