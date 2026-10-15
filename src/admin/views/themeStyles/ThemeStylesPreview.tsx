'use client'

import { useMemo } from 'react'

import { buildThemeStylesCss } from '@/features/themeStyles/css'
import type { ThemeStyles } from '@/features/themeStyles/types'

import type { TabKey } from './editorLogic'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const BASE_CSS = `
:root{--font-display:Georgia,'Times New Roman',serif;--font-body:system-ui,-apple-system,'Segoe UI',sans-serif}
*{box-sizing:border-box}
body{margin:0;padding:16px;font-family:var(--font-body);background:var(--eg-c-background);color:var(--eg-c-text)}
h1,h2,h3,h4,h5,h6,p{margin:0 0 .6em}
.group{margin:0 0 20px}
.group>h6.label{font:600 11px/1 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:0 0 8px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
.sw{border:1px solid var(--eg-c-border);border-radius:8px;overflow:hidden;font:12px/1.3 system-ui,sans-serif;background:var(--eg-c-surface);color:var(--eg-c-text)}
.sw i{display:block;height:36px}
.sw b{display:block;padding:4px 6px 0;font-weight:600}
.sw span{display:block;padding:0 6px 4px;opacity:.7}
caption{caption-side:bottom;padding-top:6px;text-align:left}
table{border-collapse:collapse;width:100%}
`

function swatches(styles: ThemeStyles): string {
  return `<div class="group"><h6 class="label">Colours</h6><div class="swatches">${styles.colours
    .map((c) => `<div class="sw"><i style="background:var(--eg-c-${esc(c.id)})"></i><b>${esc(c.name)}</b><span>${esc(c.value)}</span></div>`)
    .join('')}</div></div>
<div class="group"><h6 class="label">Sample card</h6><div class="sw" style="padding:12px;font-size:14px"><h3 style="margin:0 0 6px">Heading on surface</h3><p style="margin:0 0 8px">Body text on the surface colour with a <a href="#">link</a>.</p><a class="btn btn--primary" href="#">Primary</a></div></div>`
}

function typography(styles: ThemeStyles): string {
  const tag = (id: string) => (/^h[1-6]$/.test(id) ? id : 'p')
  return `<div class="group">${styles.typography
    .map((t) => {
      const text = `${esc(t.name)}: The quick brown fox`
      if (t.id === 'link') return `<p><a href="#">${text}</a></p>`
      if (tag(t.id) !== 'p') return `<${tag(t.id)}>${text}</${tag(t.id)}>`
      if (t.id === 'body') return `<p>${text} jumps over the lazy dog.</p>`
      if (t.id === 'small') return `<p><small>${text}</small></p>`
      if (t.id === 'caption') return `<p><span class="caption" style="font-size:${t.size}px;line-height:${t.lineHeight};letter-spacing:${t.letterSpacing}px">${text}</span></p>`
      return `<p style="font-family:var(--font-body);font-size:${t.size}px;font-weight:${t.weight};line-height:${t.lineHeight};letter-spacing:${t.letterSpacing}px;text-transform:${t.transform}">${text}</p>`
    })
    .join('')}</div>`
}

function buttons(styles: ThemeStyles): string {
  return styles.buttons
    .map(
      (b) => `<div class="group"><h6 class="label">${esc(b.name)}</h6>
<div class="row"><a class="btn btn--${esc(b.id)}" href="#">Normal</a><a class="btn btn--${esc(b.id)} is-hover" href="#">Hover</a></div>
<div class="row" style="margin-top:10px"><a class="btn btn--${esc(b.id)} btn--sm" href="#">Small</a><a class="btn btn--${esc(b.id)}" href="#">Medium</a><a class="btn btn--${esc(b.id)} btn--lg" href="#">Large</a></div></div>`,
    )
    .join('')
}

function tables(styles: ThemeStyles): string {
  return styles.tables
    .map(
      (t) => `<div class="group"><h6 class="label">${esc(t.name)}${t.id === styles.defaultTableId ? ' (default)' : ''}</h6>
<table class="eg-table eg-table--${esc(t.id)}"><caption>Caption: opening hours this week</caption>
<thead><tr><th>Item</th><th>Detail</th><th>Price</th></tr></thead><tbody>
<tr><td>Afternoon tea</td><td>Scones and sandwiches</td><td>25.00</td></tr>
<tr><td>Cocktail class</td><td>Two hours</td><td>40.00</td></tr>
<tr><td>Private hire</td><td>Up to 30 guests</td><td>300.00</td></tr>
<tr><td>Gift card</td><td>Any amount</td><td>10.00</td></tr></tbody></table></div>`,
    )
    .join('')
}

export function buildPreviewDoc(styles: ThemeStyles, tab: TabKey): string {
  let css = ''
  try {
    // Force-hover: the class .is-hover behaves like :hover in the preview only.
    css = buildThemeStylesCss(styles, { saved: true }).replace(/:hover/g, ':is(:hover,.is-hover)')
  } catch {
    css = ''
  }
  const body = tab === 'colours' ? swatches(styles) : tab === 'typography' ? typography(styles) : tab === 'buttons' ? buttons(styles) : tables(styles)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}${css.replace(/<\/style/gi, '')}</style></head><body>${body}</body></html>`
}

export function ThemeStylesPreview({ styles, tab }: { styles: ThemeStyles; tab: TabKey }) {
  const doc = useMemo(() => buildPreviewDoc(styles, tab), [styles, tab])
  return <iframe className="ts-preview" title="Live preview of theme styles" sandbox="" srcDoc={doc} />
}