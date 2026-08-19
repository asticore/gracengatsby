import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import type { Media } from '@/payload-types'

type Props = {
  heading: string
  subheading?: string | null
  backgroundImage?: (number | null) | Media
  primaryCtaLabel?: string | null
  primaryCtaUrl?: string | null
  secondaryCtaLabel?: string | null
  secondaryCtaUrl?: string | null
}

export const HeroBlock: React.FC<Props> = ({
  heading,
  subheading,
  backgroundImage,
  primaryCtaLabel,
  primaryCtaUrl,
  secondaryCtaLabel,
  secondaryCtaUrl,
}) => {
  const image = backgroundImage && typeof backgroundImage === 'object' ? backgroundImage : null

  return (
    <section className="hero built-block built-block--hero">
      {image?.url && (
        <div className="built-block--hero__image">
          <Image src={image.url} alt={image.alt || heading} fill style={{ objectFit: 'cover' }} />
        </div>
      )}
      <div className="hero__inner">
        <h1>{heading}</h1>
        {subheading && <p className="hero__tagline">{subheading}</p>}
        {(primaryCtaLabel || secondaryCtaLabel) && (
          <div className="hero__actions">
            {primaryCtaLabel && primaryCtaUrl && (
              <Link href={primaryCtaUrl} className="btn btn--primary">
                {primaryCtaLabel}
              </Link>
            )}
            {secondaryCtaLabel && secondaryCtaUrl && (
              <Link href={secondaryCtaUrl} className="btn btn--ghost">
                {secondaryCtaLabel}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
