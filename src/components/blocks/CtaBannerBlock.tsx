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
      className={`built-block built-block--ctabanner ${
        style === 'light' ? 'built-block--ctabanner-light' : 'built-block--ctabanner-dark'
      }`}
    >
      <div className="page-shell built-block--ctabanner__inner">
        <h2>{heading}</h2>
        {text && <p>{text}</p>}
        {buttonLabel && buttonUrl && (
          <Link href={buttonUrl} className="btn btn--primary">
            {buttonLabel}
          </Link>
        )}
      </div>
    </section>
  )
}
