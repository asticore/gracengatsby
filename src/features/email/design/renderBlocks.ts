/**
 * Renders each block as email-safe HTML: table rows, inline styles only, no flex,
 * grid or positioning. Every user string goes through inline.ts, so it is escaped
 * and every link is checked.
 */

import type { TemplateValues } from '../renderTemplate'

import { type EmailBrand, cleanColor, fontCss } from './brand'
import { escapeHtml, fillHtml, inlineToHtml, isSafeUrl } from './inline'
import { SOCIAL_NETWORKS, type ColumnBlock, type EmailAlign, type EmailBlock, type SocialNetwork } from './types'

export type RenderContext = { brand: EmailBrand; vars: TemplateValues }

const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  website: 'Website',
}

const alignOf = (value: unknown): EmailAlign => (value === 'center' || value === 'right' ? value : 'left')

/** Dark text on light buttons and white text on dark ones, so the label stays readable. */
export const readableOn = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff'
}

const textStyle = (ctx: RenderContext, extra = ''): string =>
  `font-family:${fontCss(ctx.brand.fontStack)};font-size:16px;line-height:1.5;color:${ctx.brand.textColor};${extra}`

const heading = (block: Extract<EmailBlock, { type: 'heading' }>, ctx: RenderContext): string => {
  const size = block.level === 1 ? 28 : block.level === 2 ? 22 : 18
  const level = block.level
  return `<h${level} style="margin:0;${textStyle(ctx, `font-size:${size}px;line-height:1.25;font-weight:bold;text-align:${alignOf(block.align)};`)}">${fillHtml(block.text, ctx.vars)}</h${level}>`
}

const paragraphs = (text: string, ctx: RenderContext, align: EmailAlign): string =>
  text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => {
      const body = inlineToHtml(paragraph.trim(), ctx.vars, `color:${ctx.brand.accent};text-decoration:underline;`, 'font-weight:bold;').replace(/\n/g, '<br />')
      return `<p style="margin:0 0 12px 0;${textStyle(ctx, `text-align:${align};`)}">${body}</p>`
    })
    .join('')

const button = (block: Extract<EmailBlock, { type: 'button' }>, ctx: RenderContext): string => {
  const bg = cleanColor(block.color, ctx.brand.accent)
  const fg = readableOn(bg)
  const radius = ctx.brand.buttonRadius
  const label = fillHtml(block.label, ctx.vars)
  const url = fillPlainUrl(block.url, ctx)
  const align = alignOf(block.align)
  const inner = `display:inline-block;padding:12px 24px;${textStyle(ctx)}font-weight:bold;color:${fg};text-decoration:none;border-radius:${radius}px;background-color:${bg};`
  const anchor = isSafeUrl(url) ? `<a href="${escapeHtml(url)}" target="_blank" style="${inner}">${label}</a>` : `<span style="${inner}">${label}</span>`
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="border-radius:${radius}px;background-color:${bg};">${anchor}</td></tr></table>`
}

const fillPlainUrl = (url: string, ctx: RenderContext): string => {
  const filled = url.replace(/\{\{\s*(\w+)\s*\}\}/g, (_whole, key: string) => {
    const value = ctx.vars[key]
    return value === undefined || value === null ? '' : String(value)
  })
  return filled.trim()
}

const image = (block: Extract<EmailBlock, { type: 'image' }>, ctx: RenderContext): string => {
  if (!/^https?:\/\//i.test(block.src.trim())) return ''
  const width = Math.min(600, Math.max(1, Math.round(block.width)))
  const align = alignOf(block.align ?? 'center')
  const margin = align === 'center' ? 'margin:0 auto;' : align === 'right' ? 'margin:0 0 0 auto;' : 'margin:0;'
  const img = `<img src="${escapeHtml(block.src.trim())}" alt="${escapeHtml(fillPlainUrl(block.alt, ctx))}" width="${width}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:${width}px;max-width:100%;${margin}" />`
  const link = block.link ? fillPlainUrl(block.link, ctx) : ''
  return isSafeUrl(link) ? `<a href="${escapeHtml(link)}" target="_blank" style="text-decoration:none;">${img}</a>` : img
}

const social = (block: Extract<EmailBlock, { type: 'social' }>, ctx: RenderContext): string =>
  block.links
    .filter((link) => (SOCIAL_NETWORKS as readonly string[]).includes(link.network) && isSafeUrl(link.url))
    .map(
      (link) =>
        `<a href="${escapeHtml(link.url.trim())}" target="_blank" style="${textStyle(ctx, `font-size:14px;color:${ctx.brand.accent};text-decoration:underline;`)}">${SOCIAL_LABELS[link.network]}</a>`,
    )
    .join(`<span style="${textStyle(ctx, 'font-size:14px;')}">&#160;&#160;|&#160;&#160;</span>`)

/** The inside of one column or one full-width block, without its table cell. */
export const renderInner = (block: EmailBlock | ColumnBlock, ctx: RenderContext): string => {
  switch (block.type) {
    case 'heading':
      return heading(block, ctx)
    case 'text':
      return paragraphs(block.text, ctx, alignOf(block.align))
    case 'button':
      return button(block, ctx)
    case 'image':
      return image(block, ctx)
    case 'social':
      return `<div style="text-align:center;">${social(block, ctx)}</div>`
    case 'footerNote':
      return `<p style="margin:0;font-family:${fontCss(ctx.brand.fontStack)};font-size:12px;line-height:1.5;color:#666666;">${fillHtml(block.text, ctx.vars)}</p>`
    default:
      return ''
  }
}

const row = (inner: string, ctx: RenderContext, align: EmailAlign = 'left'): string =>
  `<tr><td align="${align}" class="pad" style="padding:0 24px 16px 24px;${textStyle(ctx)}">${inner}</td></tr>`

/** One top-level block as one or more table rows. */
export const renderRows = (block: EmailBlock, ctx: RenderContext): string => {
  if (block.type === 'spacer') {
    const height = Math.min(200, Math.max(4, Math.round(block.height)))
    return `<tr><td style="height:${height}px;line-height:${height}px;font-size:1px;">&#160;</td></tr>`
  }
  if (block.type === 'divider') {
    return `<tr><td class="pad" style="padding:0 24px 16px 24px;"><div style="height:1px;line-height:1px;font-size:1px;background-color:#dddddd;">&#160;</div></td></tr>`
  }
  if (block.type === 'columns2') {
    const column = (blocks: ColumnBlock[], pad: string) =>
      `<td class="stack" width="50%" valign="top" style="width:50%;${pad}">${blocks.map((item) => `<div style="padding:0 0 12px 0;">${renderInner(item, ctx)}</div>`).join('')}</td>`
    return `<tr><td class="pad" style="padding:0 24px 16px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${column(block.left, 'padding-right:12px;')}${column(block.right, 'padding-left:12px;')}</tr></table></td></tr>`
  }
  const align = 'align' in block ? alignOf(block.align) : 'left'
  return row(renderInner(block, ctx), ctx, align)
}
