import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import type { Media } from '@/engage-types'
import { safeUrl } from '@/lib/mergeTags'

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
  const primaryHref = safeUrl(primaryCtaUrl)
  const secondaryHref = safeUrl(secondaryCtaUrl)

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
            {primaryCtaLabel && primaryHref && (
              <Link href={primaryHref} className="btn btn--primary">
                {primaryCtaLabel}
              </Link>
            )}
            {secondaryCtaLabel && secondaryHref && (
              <Link href={secondaryHref} className="btn btn--ghost">
                {secondaryCtaLabel}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
