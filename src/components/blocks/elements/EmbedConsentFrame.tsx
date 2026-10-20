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
}

/**
 * The iframe of an `embed` element, held back until the visitor accepts marketing cookies.
 * The iframe is created here, in the browser, so the server HTML never contains it: the
 * server only renders the consent placeholder.
 */
export const EmbedConsentFrame = ({ src, title, providerName, aspectRatio, sandbox, allow }: EmbedConsentFrameProps) => (
  <div className="be-el-48-embed" style={{ aspectRatio } as React.CSSProperties}>
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
