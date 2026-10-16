import React from 'react'

import { sanitizeSlug } from '@/features/themeStyles/sanitize'

import { alignClass } from './TextElements'
import { mapEmbedSrc, num, pick, sanitizeHtml, str } from './elementUtil'

type P = Record<string, unknown>

/** `divider`: a rule in one of four styles, optionally with a centred word. */
export const DividerElement: React.FC<P> = (p) => {
  const style = pick(p.style, ['solid', 'dashed', 'dotted', 'double'] as const, 'solid')
  const weight = num(p.weight, 1, 1, 12)
  const width = num(p.width, 100, 5, 100)
  const label = str(p.label)
  const css = { borderTopStyle: style, borderTopWidth: style === 'double' ? Math.max(weight, 3) : weight }
  if (!label) return <hr className={`el-divider ${alignClass(p.align ?? 'center')}`} style={{ ...css, width: `${width}%` }} />
  return (
    <div className="el-divider el-divider--label" role="separator" style={{ width: `${width}%` }}>
      <span style={css} />
      <em>{label}</em>
      <span style={css} />
    </div>
  )
}

/** `spacer`: empty vertical space. */
export const SpacerElement: React.FC<P> = (p) => <div className="el-spacer" aria-hidden="true" style={{ height: num(p.height, 48, 0, 600) }} />

/** `anchor`: an invisible jump target, so a menu link such as /page#pricing scrolls here. */
export const AnchorElement: React.FC<P> = (p) => {
  const id = sanitizeSlug(str(p.id))
  return id ? <div id={id} className="el-anchor" aria-hidden="true" /> : null
}

/** `html`: admin-authored markup, run through the allow-list sanitiser first (no script, iframe, forms or on* handlers). */
export const HtmlElement: React.FC<P> = (p) => {
  const html = sanitizeHtml(p.html)
  if (!html.trim()) return null
  return <div className="el-html" dangerouslySetInnerHTML={{ __html: html }} />
}

/** `map`: a Google or OpenStreetMap embed from an address, "lat,lng" or a pasted embed link on an allow-listed host. */
export const MapElement: React.FC<P> = (p) => {
  const src = mapEmbedSrc(p.address, p.embedUrl, num(p.zoom, 14, 1, 20))
  const height = num(p.height, 320, 120, 800)
  if (!src) return <div className="el-placeholder" style={{ height }}>Enter an address for the map</div>
  return (
    <div className="el-map" style={{ height }}>
      <iframe src={src} title={str(p.title, 'Map')} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
    </div>
  )
}
