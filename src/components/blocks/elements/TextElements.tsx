import React from 'react'

import { RichText } from '@/engine/editor/react'

import { MARKS_NO_LINK } from '@/views/visualEditor/inlineFormat'

import { Icon } from './icons'
import { SafeInlineHtml } from './SafeInlineHtml'
import { cells, iconName, linkAttrs, linkHref, lines, num, pick, str } from './elementUtil'
import './list.css'

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
        <SafeInlineHtml as="p" text={str(p.text, 'A memorable quotation.')} />
      </blockquote>
      {cite && <figcaption>{href ? <a href={href} {...linkAttrs(p.citeUrl)}>{cite}</a> : cite}</figcaption>}
    </figure>
  )
}

/** `icon-list`: one line per item as "Text | optional link", each with the same icon. */
export const IconListElement: React.FC<P> = (p) => {
  const icon = iconName(p.icon) || 'check'
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

/** Markers for `list`. bullets, numbers and none are the original kinds; the rest are the marker options added later. */
export const LIST_MARKERS = ['bullets', 'numbers', 'none', 'icon', 'check', 'arrow', 'dash'] as const
export type ListMarker = (typeof LIST_MARKERS)[number]
const SYMBOL_MARKERS: readonly ListMarker[] = ['check', 'arrow', 'dash']
const COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** The marker to draw. Saved pages carry `kind` (bullets/numbers/none) and no `marker`; that maps straight across. */
export function listMarker(p: P): ListMarker {
  return pick(p.marker ?? p.kind, LIST_MARKERS, 'bullets')
}

/** Rows as {text, href}. Plain text lines and repeater rows (text plus optional href) both work; empty rows drop out. */
function listRows(v: unknown): { text: string; href: string }[] {
  if (!Array.isArray(v)) return lines(v).map((text) => ({ text, href: '' }))
  const out: { text: string; href: string }[] = []
  for (const row of v) {
    const text = lines([row])[0] ?? ''
    if (!text) continue
    const href = row && typeof row === 'object' ? linkHref((row as Record<string, unknown>).href) : ''
    out.push({ text, href })
  }
  return out
}

const isSet = (v: unknown) => v !== undefined && v !== null && v !== ''

/**
 * `list`: a bulleted, numbered or unmarked list, or one with an icon, check, arrow or dash marker. One item per line
 * or per repeater row; a row may link. Markers are decorative (aria-hidden or CSS), so screen readers get a plain
 * ul/ol. Props that are unset are left off the markup, so saved bullets/numbers/none lists render as before.
 */
export const ListElement: React.FC<P> = (p) => {
  const marker = listMarker(p)
  const Tag = marker === 'numbers' ? 'ol' : 'ul'
  const symbolic = SYMBOL_MARKERS.includes(marker) || marker === 'icon'
  const iconSize = num(p.size, 18, 14, 28)
  const iconPath = iconName(p.icon) || 'check'
  const vars: Record<string, string> = {}
  if (isSet(p.gap)) vars['--el-list-gap'] = `${num(p.gap, 0, 0, 32)}px`
  if (symbolic && isSet(p.size)) vars['--el-list-size'] = `${iconSize}px`
  const colour = str(p.iconColour).trim()
  if (symbolic && COLOUR.test(colour)) vars['--el-list-colour'] = colour
  const style = Object.keys(vars).length ? (vars as React.CSSProperties) : undefined
  const rows = listRows(p.items)
  const cls = symbolic ? `el-list el-list--marked el-list--${marker} ${alignClass(p.align)}` : `el-list el-list--${marker} ${alignClass(p.align)}`
  return (
    <Tag className={cls} style={style} role={symbolic && Tag === 'ul' ? 'list' : undefined}>
      {rows.map((row, i) => {
        const body = row.href ? <a href={row.href}><SafeInlineHtml text={row.text} formats={MARKS_NO_LINK} /></a> : <SafeInlineHtml text={row.text} />
        return (
          <li key={i}>
            {marker === 'icon' && <Icon name={iconPath} size={iconSize} className="el-list__marker" />}
            {body}
          </li>
        )
      })}
    </Tag>
  )
}