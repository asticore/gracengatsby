'use client'

import React, { useEffect, useRef, useState } from 'react'

import { ConsentGate } from '@/features/consent/ConsentGate'
import { EMBED_CODE_SANDBOX, parseResizeMessage, type EmbedCodeCategory } from '@/lib/embedCode'

import './embedCode.css'

export type EmbedCodeFrameProps = {
  hash: string
  path: string
  title: string
  category: EmbedCodeCategory
  /** Fixed height in px, or null to follow the height the frame reports. */
  height: number | null
}

/**
 * The sandboxed iframe, created only in the browser after consent so the server HTML has no iframe and the third
 * party gets no request before then. Auto-resize: the frame posts its height; a message counts only when
 * event.source is this exact iframe window (parseResizeMessage).
 */
const Frame = ({ hash, path, title, height }: Omit<EmbedCodeFrameProps, 'category'>) => {
  const ref = useRef<HTMLIFrameElement>(null)
  const [auto, setAuto] = useState<number | null>(null)

  useEffect(() => {
    if (height) return
    const onMessage = (event: MessageEvent) => {
      const next = parseResizeMessage(event, ref.current?.contentWindow, hash)
      if (next !== null) setAuto(next)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [hash, height])

  const px = height ?? auto ?? 300
  return (
    <iframe
      ref={ref}
      className="eg-embed-code__frame"
      src={`/embed-frame/${hash}?path=${encodeURIComponent(path)}`}
      title={title}
      loading="lazy"
      sandbox={EMBED_CODE_SANDBOX}
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ height: `${px}px` }}
    />
  )
}

export const EmbedCodeFrame = ({ category, ...rest }: EmbedCodeFrameProps) => (
  <div className="eg-embed-code">
    <ConsentGate
      category={category}
      title={rest.title}
      description="This embedded content comes from a third party and runs its own code. Accept the matching cookies to load it."
      acceptLabel="Accept and load"
    >
      <Frame {...rest} />
    </ConsentGate>
    <noscript>
      <p className="eg-embed-code__noscript">{`${rest.title}: this embedded content needs JavaScript.`}</p>
    </noscript>
  </div>
)

/** Canvas card: the first 80 characters as plain text. Never executes or loads the snippet. */
export const EmbedCodeCanvasCard = ({ snippet, title }: { snippet: string; title: string }) => (
  <div className="eg-embed-code__canvas" role="note">
    <strong>{title || 'Embed code (third-party script)'}</strong>
    <code>{snippet.trim() ? snippet.trim().slice(0, 80) : 'Paste your embed code in the panel.'}</code>
    <span>Runs in an isolated frame on the published page only.</span>
  </div>
)
