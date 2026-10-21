import React from 'react'

import { safeUrl } from '@/lib/mergeTags'
import { LANGS, parsePlaylist, tokenize } from '@/lib/elements/wave64Util'

import { flag, mediaOf, parseVideoUrl, pick, str } from './elementUtil'
import { CopyButton, ImageAccordion, VideoPlaylist } from './Wave64Client'
import type { Panel } from './Wave64Client'
import './wave48.css'
import './wave64.css'

/** Wave 64 renderers (src/lib/elements/wave64Defs.ts). All text is React text, so it is escaped. */

type P = Record<string, unknown>

export const AudioElement: React.FC<P> = (p) => {
  const src = mediaOf(p.file)?.url || mediaOf(p.url)?.url
  if (!src) return <div className="el-placeholder">Choose an audio file</div>
  const title = str(p.title, 'Audio')
  return (
    <figure className="be-el-64-audio">
      {title && <figcaption>{title}</figcaption>}
      <audio src={src} controls preload="none" loop={flag(p.loop)} aria-label={title || 'Audio'} />
    </figure>
  )
}

export const CodeHighlightElement: React.FC<P> = (p) => {
  const code = str(p.code).replace(/\s+$/, '')
  if (!code) return <div className="el-placeholder">Add some code</div>
  const lang = pick(p.language, LANGS, 'js')
  const toks = tokenize(code, lang)
  const nums = flag(p.lineNumbers, true)
  const count = code.split('\n').length
  return (
    <div className="be-el-64-code">
      {flag(p.copy, true) && <CopyButton text={code} />}
      <pre tabIndex={0} aria-label={`${lang} code`}>
        {nums && (
          <span className="be-el-64-code__nums" aria-hidden="true">
            {Array.from({ length: count }, (_, i) => i + 1).join('\n')}
          </span>
        )}
        <code>
          {toks.map((t, i) => (t.t === 'plain' ? t.v : <span key={i} className={`be-tok-${t.t}`}>{t.v}</span>))}
        </code>
      </pre>
    </div>
  )
}

export const ImageAccordionElement: React.FC<P> = (p) => {
  const raw = Array.isArray(p.panels) ? (p.panels as P[]) : []
  const panels: Panel[] = []
  for (const r of raw.slice(0, 6)) {
    const url = mediaOf(r?.image)?.url || safeUrl(str(r?.url))
    if (!url) continue
    const href = str(r?.link).trim()
    panels.push({ url, title: str(r?.title), alt: str(r?.alt), href: href ? safeUrl(href) || '' : '' })
  }
  if (panels.length < 2) return <div className="el-placeholder">Add at least two panels with pictures</div>
  return <ImageAccordion panels={panels} height={Math.min(700, Math.max(200, Number(p.height) || 360))} />
}

export const VideoPlaylistElement: React.FC<P> = (p) => {
  const items = parsePlaylist(str(p.items), parseVideoUrl)
  if (items.length === 0) return <div className="el-placeholder">Add video links, one per line</div>
  return <VideoPlaylist items={items} label={str(p.label, 'Video playlist')} />
}

export const WAVE64_COMPONENTS: Record<string, React.ComponentType<P>> = {
  audio: AudioElement,
  'code-highlight': CodeHighlightElement,
  'image-accordion': ImageAccordionElement,
  'video-playlist': VideoPlaylistElement,
}
