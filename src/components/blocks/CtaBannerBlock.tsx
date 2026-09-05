import Link from 'next/link'
import React from 'react'

export const CtaBannerBlock: React.FC<{
  heading: string
  text?: string | null
  buttonLabel?: string | null
  buttonUrl?: string | null
  style?: 'dark' | 'light' | null
}> = ({ heading, text, buttonLabel, buttonUrl, style }) => {
  return (
    <section
      className={`built-block px-6 py-20 text-center ${
        style === 'light' ? 'bg-[var(--color-cream-dim)]' : 'bg-[var(--color-ink)] text-[var(--color-cream)]'
      }`}
    >
      <div className="mx-auto max-w-[640px]">
        <h2>{heading}</h2>
        {text && <p className="mb-6 opacity-85">{text}</p>}
        {buttonLabel && buttonUrl && (
          <Link href={buttonUrl} className="btn btn--primary">
            {buttonLabel}
          </Link>
        )}
      </div>
    </section>
  )
}
