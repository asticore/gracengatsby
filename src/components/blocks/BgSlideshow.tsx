import React from 'react'

import './effects53.css'

import { noiseLayer, slideshowLayer, type BlockStyle } from '@/lib/blockStyle'

/**
 * Background slideshow (bgType 'slideshow') as a CSS-only crossfade: one div per slide, staggered by
 * animation-delay (see effects53.css). No JS. The first slide is also the wrapper's own background, so it is
 * the static picture without CSS animation or under reduced motion. Renders nothing under 2 slides.
 */
export const BgSlideshow: React.FC<{ design: BlockStyle }> = ({ design }) => {
  const layer = slideshowLayer(design)
  if (!layer) return null
  return (
    <div className={layer.className} aria-hidden="true" style={layer.style}>
      {layer.slides.map((s, i) => (
        <div key={`${i}-${s.url}`} className="be-ss__s" style={s.style} />
      ))}
    </div>
  )
}

/** Noise layer (design.noise 0-100) drawn over the background and gradient. */
export const BgNoise: React.FC<{ design: BlockStyle }> = ({ design }) => {
  const layer = noiseLayer(design)
  return layer ? <div className={layer.className} aria-hidden="true" style={layer.style} /> : null
}
