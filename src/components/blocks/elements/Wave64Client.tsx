'use client'

import React, { useState } from 'react'

import { EmbedConsentFrame } from './EmbedConsentFrame'
import { EMBED_NAME, embedLayout } from '@/lib/embedProviders'

/** Client parts of wave 64: code copy button, image accordion, video playlist. Props are plain data from the server render. */

export const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="be-el-64-code__copy"
      onClick={() => {
        const ok = (): void => {
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        }
        navigator.clipboard?.writeText(text).then(ok, (): void => undefined)
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

export type Panel = { url: string; title: string; alt: string; href: string }

export const ImageAccordion: React.FC<{ panels: Panel[]; height: number }> = ({ panels, height }) => {
  const [open, setOpen] = useState(0)
  return (
    <div className="be-el-64-acc" style={{ height }}>
      {panels.map((p, i) => {
        const body = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.alt} loading="lazy" />
            {p.title && <span className="be-el-64-acc__title">{p.title}</span>}
          </>
        )
        const cls = `be-el-64-acc__panel${i === open ? ' is-open' : ''}`
        const on = { onMouseEnter: () => setOpen(i), onFocus: () => setOpen(i) }
        return p.href ? (
          <a key={i} className={cls} href={p.href} {...on} onClick={(e) => { if (i !== open) { e.preventDefault(); setOpen(i) } }}>{body}</a>
        ) : (
          <button key={i} type="button" className={cls} aria-expanded={i === open} {...on} onClick={() => setOpen(i)}>{body}</button>
        )
      })}
    </div>
  )
}

export type Video = { src: string; kind: 'youtube' | 'vimeo' | 'file' | 'spotify' | 'soundcloud'; title: string }

export const VideoPlaylist: React.FC<{ items: Video[]; label: string }> = ({ items, label }) => {
  const [cur, setCur] = useState(0)
  const v = items[cur] ?? items[0]
  if (!v) return null
  return (
    <div className="be-el-64-pl" role="group" aria-label={label}>
      <div className="be-el-64-pl__main">
        {v.kind === 'file' ? (
          <video key={v.src} src={v.src} controls preload="metadata" playsInline aria-label={v.title} />
        ) : (
          <EmbedConsentFrame
            key={v.src}
            src={v.src}
            title={v.title}
            providerName={EMBED_NAME[v.kind]}
            aspectRatio="16 / 9"
            {...(v.kind === 'spotify' || v.kind === 'soundcloud' ? embedLayout(v.kind, v.src) : {})}
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            allow="fullscreen; picture-in-picture"
          />
        )}
      </div>
      <ul className="be-el-64-pl__list">
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" aria-current={i === cur ? 'true' : undefined} onClick={() => setCur(i)}>{it.title}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
