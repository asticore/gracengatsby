import React from 'react'

import { RichText } from '@/engine/editor/react'

import { Icon } from './icons'
import { cells, linkAttrs, linkHref, lines, pick, str } from './elementUtil'

export const ALIGNS = ['left', 'center', 'right'] as const
export type Align = (typeof ALIGNS)[number]
export const alignClass = (v: unknown): string => `el-align--${pick(v, ALIGNS, 'left')}`

type P = Record<string, unknown>

/** `text-editor`: a block of rich text, rendered with the same helper as the Rich text block. */
export const TextEditorElement: React.FC<P> = (p) => {
  const content = p.content as never
  return (
    <div className={`el-text-editor ${alignClass(p.align)}`}>
      {content ? <RichText data={content} /> : <p>Edit this text.</p>}
    </div>
  )
}

/** `quote`: a blockquote with an optional cited author and source link. */
export const QuoteElement: React.FC<P> = (p) => {
  const style = pick(p.style, ['bar', 'large', 'plain'] as const, 'bar')
  const cite = str(p.cite)
  const href = linkHref(p.citeUrl)
  return (
    <figure className={`el-quote el-quote--${style} ${alignClass(p.align)}`}>
      <blockquote>
        <p>{str(p.text, 'A memorable quotation.')}</p>
      </blockquote>
      {cite && <figcaption>{href ? <a href={href} {...linkAttrs(p.citeUrl)}>{cite}</a> : cite}</figcaption>}
    </figure>
  )
}

/** `icon-list`: one line per item as "Text | optional link", each with the same icon. */
export const IconListElement: React.FC<P> = (p) => {
  const icon = str(p.icon, 'check')
  const rows = cells(p.items, 2)
  return (
    <ul className={`el-icon-list el-icon-list--${pick(p.layout, ['stacked', 'inline'] as const, 'stacked')} ${alignClass(p.align)}`}>
      {rows.map(([text, link], i) => {
        const href = linkHref(link)
        return (
          <li key={i}>
            <Icon name={icon} size={18} className="el-icon-list__icon" />
            <span>{href ? <a href={href}>{text}</a> : text}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** `list`: a plain bulleted, numbered or unmarked list, one item per line. */
export const ListElement: React.FC<P> = (p) => {
  const kind = pick(p.kind, ['bullets', 'numbers', 'none'] as const, 'bullets')
  const items = lines(p.items)
  const Tag = kind === 'numbers' ? 'ol' : 'ul'
  return (
    <Tag className={`el-list el-list--${kind} ${alignClass(p.align)}`}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  )
}
