'use client'

import { useMemo } from 'react'

import { buildThemeStylesCss } from '@/features/themeStyles/css'
import type { ThemeStyles } from '@/features/themeStyles/types'

import type { InstalledFontOption } from './TypographyControls'
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
label{display:block;margin-bottom:4px}
input,select,textarea{width:100%}
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

const IMAGE_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8aa4d6"/><stop offset="1" stop-color="#e3b7c8"/></linearGradient></defs><rect width="320" height="160" fill="url(#g)"/><circle cx="240" cy="50" r="22" fill="#ffffff" fill-opacity=".7"/><path d="M0 160 L110 70 L190 130 L240 95 L320 160 Z" fill="#ffffff" fill-opacity=".45"/></svg>',
)

function layout(): string {
  return `<div class="group"><h6 class="label">Form</h6>
<form style="display:grid;gap:12px;max-width:360px">
<div><label for="pv-name">Name</label><input id="pv-name" type="text" placeholder="Your name"></div>
<div><label for="pv-topic">Topic</label><select id="pv-topic"><option>General question</option><option>Booking</option></select></div>
<div><label for="pv-msg">Message</label><textarea id="pv-msg" rows="3" placeholder="How can we help?"></textarea></div>
<p class="form-error" role="alert" style="margin:0">Please enter a valid email address.</p>
<div><a class="btn btn--primary" href="#">Send</a></div></form></div>
<div class="group"><h6 class="label">Link</h6><div class="rich-text"><p>Read the <a href="#">full story</a> or <a class="is-hover" href="#">hover link</a>.</p></div></div>
<div class="group"><h6 class="label">Image</h6><div class="rich-text"><img src="data:image/svg+xml,${IMAGE_SVG}" alt="Placeholder landscape" width="320" height="160" style="max-width:100%;height:auto"></div></div>
<div class="group"><h6 class="label">Section</h6><section class="eg-preview-section" style="background:var(--eg-c-surface);border:1px dashed var(--eg-c-border);padding:var(--eg-section-padding, 40px) 16px"><div style="display:grid;gap:var(--eg-gap, 16px);max-width:var(--max-width,1180px);margin:0 auto"><div class="sw" style="padding:8px">Block one</div><div class="sw" style="padding:8px">Block two</div></div></section></div>`
}

export function buildPreviewDoc(styles: ThemeStyles, tab: TabKey, fonts: InstalledFontOption[] = []): string {
  let css = ''
  try {
    // Force-hover: the class .is-hover behaves like :hover in the preview only.
    const options = { saved: true, fonts }
    css = buildThemeStylesCss(styles, options).replace(/:hover/g, ':is(:hover,.is-hover)')
  } catch {
    css = ''
  }
  const body = tab === 'colours' ? swatches(styles) : tab === 'typography' ? typography(styles) : tab === 'buttons' ? buttons(styles) : tab === 'tables' ? tables(styles) : tab === 'layout' ? layout() : swatches(styles) + layout()
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}${css.replace(/<\/style/gi, '')}</style></head><body>${body}</body></html>`
}

export function ThemeStylesPreview({ styles, tab, fonts = [] }: { styles: ThemeStyles; tab: TabKey; fonts?: InstalledFontOption[] }) {
  const doc = useMemo(() => buildPreviewDoc(styles, tab, fonts), [styles, tab, fonts])
  return <iframe className="ts-preview" title="Live preview of theme styles" sandbox="" srcDoc={doc} />
}