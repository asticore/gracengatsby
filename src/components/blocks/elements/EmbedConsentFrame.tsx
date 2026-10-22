'use client'

import React from 'react'

import { ConsentGate } from '@/features/consent/ConsentGate'

export type EmbedConsentFrameProps = {
  src: string
  title: string
  providerName: string
  aspectRatio: string
  sandbox: string
  allow: string
  /** Fixed height in px (tall social embeds, audio players); replaces the aspect ratio. */
  height?: number
  maxWidth?: number
}

/**
 * The iframe of an `embed` element, held back until the visitor accepts marketing cookies.
 * The iframe is created here, in the browser, so the server HTML never contains it: the
 * server only renders the consent placeholder.
 */
export const EmbedConsentFrame = ({ src, title, providerName, aspectRatio, sandbox, allow, height, maxWidth }: EmbedConsentFrameProps) => (
  <div
    className="be-el-48-embed"
    style={(height ? { height: `${height}px`, ...(maxWidth ? { maxWidth: `${maxWidth}px`, marginInline: 'auto' } : {}) } : { aspectRatio }) as React.CSSProperties}
  >
    <ConsentGate
      category="marketing"
      title={`${providerName} embed`}
      description={`This ${providerName} embed comes from a third party and needs marketing cookies. Accept to load it.`}
      acceptLabel="Accept and load"
    >
      <iframe
        className="be-el-48-embed__frame"
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox={sandbox}
        allow={allow}
        allowFullScreen
      />
    </ConsentGate>
  </div>
)
