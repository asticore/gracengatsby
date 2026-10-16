import type { SectionNode } from '@/lib/sectionTree'

/**
 * A tiny wireframe picture of a block tree, used as the preview image of a template card that has no real
 * screenshot. Pure and deterministic: the same nodes always give the same string, there is no script in the
 * output and nothing but ASCII.
 *
 * Colours are written as `var(--tpl-<name>, <fallback>)`. When the SVG is inlined in a page that defines those
 * variables they win; as an <img> data URL (what the template browser uses) the fallbacks apply, and the caller
 * can pass the site's own colours as `palette` so the fallbacks match the editor theme.
 */

export type ThumbnailPalette = {
  bg: string
  surface: string
  ink: string
  muted: string
  accent: string
  line: string
}

export const DEFAULT_THUMBNAIL_PALETTE: ThumbnailPalette = {
  bg: '#f4f5f7',
  surface: '#ffffff',
  ink: '#2b2f36',
  muted: '#c3c8d0',
  accent: '#3b6fd4',
  line: '#dde1e6',
}

const WIDTH = 160
const HEIGHT = 120
const PAD = 8
const MAX_DEPTH = 4

type Ctx = { c: (name: keyof ThumbnailPalette) => string }
type Drawn = { svg: string; h: number }

const n = (value: number): string => {
  return String(Math.round(value * 100) / 100)
}

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 1.5, stroke?: string): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" rx="${n(rx)}" style="fill:${fill}${stroke ? `;stroke:${stroke};stroke-width:0.8` : ''}"/>`

const circle = (cx: number, cy: number, r: number, fill: string): string =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" style="fill:${fill}"/>`

/** A picture placeholder: muted box with a little hill and sun so it reads as an image. */
const picture = (ctx: Ctx, x: number, y: number, w: number, h: number): string => {
  const hill = `M${n(x)} ${n(y + h)} L${n(x + w * 0.38)} ${n(y + h * 0.5)} L${n(x + w * 0.62)} ${n(y + h * 0.78)} L${n(x + w * 0.78)} ${n(y + h * 0.58)} L${n(x + w)} ${n(y + h)} Z`
  return (
    rect(x, y, w, h, ctx.c('muted'), 1.5) +
    `<path d="${hill}" style="fill:${ctx.c('line')}"/>` +
    circle(x + w * 0.24, y + h * 0.26, Math.max(1.2, Math.min(w, h) * 0.09), ctx.c('surface'))
  )
}

/** Lines of text with a shorter last line. */
const textLines = (ctx: Ctx, x: number, y: number, w: number, count: number, fill?: string): Drawn => {
  let svg = ''
  for (let i = 0; i < count; i += 1) {
    const last = i === count - 1 && count > 1
    svg += rect(x, y + i * 4.5, last ? w * 0.6 : w, 2, fill || ctx.c('muted'), 1)
  }
  return { svg, h: count * 4.5 }
}

const headlineBars = (ctx: Ctx, x: number, y: number, w: number, centred: boolean, fill?: string): Drawn => {
  const first = w * 0.72
  const second = w * 0.46
  const ink = fill || ctx.c('ink')
  const x1 = centred ? x + (w - first) / 2 : x
  const x2 = centred ? x + (w - second) / 2 : x
  return { svg: rect(x1, y, first, 4.5, ink, 1.2) + rect(x2, y + 7, second, 4.5, ink, 1.2), h: 12 }
}

const pill = (ctx: Ctx, x: number, y: number, w: number, centred: boolean): string => {
  const pw = Math.min(w, 28)
  return rect(centred ? x + (w - pw) / 2 : x, y, pw, 7, ctx.c('accent'), 3.5)
}

const asNodes = (value: unknown): SectionNode[] => (Array.isArray(value) ? (value as SectionNode[]).filter((v) => v && typeof v === 'object') : [])

const elementType = (node: SectionNode): string => (typeof node.elementType === 'string' ? node.elementType : '')

function drawElement(ctx: Ctx, type: string, x: number, y: number, w: number): Drawn {
  switch (type) {
    case 'heading': {
      return { svg: rect(x, y, w * 0.7, 5, ctx.c('ink'), 1.2), h: 8 }
    }
    case 'button':
      return { svg: pill(ctx, x, y, w, false), h: 9 }
    case 'image':
    case 'video':
    case 'image-gallery':
    case 'image-carousel':
      return { svg: picture(ctx, x, y, w, Math.min(30, w * 0.65)), h: Math.min(30, w * 0.65) + 3 }
    case 'icon':
      return { svg: circle(x + 5, y + 5, 5, ctx.c('accent')), h: 13 }
    case 'icon-box': {
      const t = textLines(ctx, x, y + 14, w, 2)
      return { svg: circle(x + w / 2, y + 5, 5, ctx.c('accent')) + rect(x + w * 0.2, y + 11, w * 0.6, 2.4, ctx.c('ink'), 1) + t.svg, h: 24 }
    }
    case 'image-box': {
      const t = textLines(ctx, x, y + 25, w, 2)
      return { svg: picture(ctx, x, y, w, 21) + t.svg, h: 35 }
    }
    case 'testimonial': {
      const t = textLines(ctx, x + 3, y + 8, w - 6, 3)
      return {
        svg:
          rect(x, y, w, 36, ctx.c('surface'), 2, ctx.c('line')) +
          rect(x + 3, y + 3, 8, 2.4, ctx.c('accent'), 1) +
          t.svg +
          circle(x + 6, y + 29, 3, ctx.c('muted')) +
          rect(x + 12, y + 28, w * 0.35, 2, ctx.c('ink'), 1),
        h: 38,
      }
    }
    case 'pricing-table':
      return {
        svg:
          rect(x, y, w, 52, ctx.c('surface'), 2, ctx.c('accent')) +
          rect(x + w * 0.25, y + 5, w * 0.5, 2.4, ctx.c('muted'), 1) +
          rect(x + w * 0.3, y + 11, w * 0.4, 6, ctx.c('ink'), 1.2) +
          textLines(ctx, x + 4, y + 22, w - 8, 3).svg +
          pill(ctx, x + 3, y + 41, w - 6, true),
        h: 54,
      }
    case 'price-list':
      return { svg: textLines(ctx, x, y, w, 4).svg, h: 20 }
    case 'team-member':
      return {
        svg: circle(x + w / 2, y + 9, 8, ctx.c('muted')) + rect(x + w * 0.25, y + 21, w * 0.5, 2.6, ctx.c('ink'), 1) + rect(x + w * 0.32, y + 26, w * 0.36, 2, ctx.c('muted'), 1),
        h: 32,
      }
    case 'call-to-action':
      return { svg: rect(x, y, w, 26, ctx.c('ink'), 2) + rect(x + w * 0.2, y + 5, w * 0.6, 3.5, ctx.c('surface'), 1) + pill(ctx, x, y + 15, w, true), h: 28 }
    case 'accordion':
    case 'toggle':
    case 'tabs': {
      let svg = ''
      for (let i = 0; i < 3; i += 1) svg += rect(x, y + i * 8, w, 6, ctx.c('surface'), 1.2, ctx.c('line')) + rect(x + 2, y + i * 8 + 2, w * 0.4, 2, ctx.c('muted'), 1)
      return { svg, h: 25 }
    }
    case 'quote':
      return { svg: rect(x, y, 1.6, 14, ctx.c('accent'), 0.8) + textLines(ctx, x + 5, y + 1, w - 5, 3).svg, h: 16 }
    case 'icon-list':
    case 'list': {
      let svg = ''
      for (let i = 0; i < 3; i += 1) svg += circle(x + 2, y + 2 + i * 6, 1.6, ctx.c('accent')) + rect(x + 7, y + 1 + i * 6, w * 0.6, 2, ctx.c('muted'), 1)
      return { svg, h: 19 }
    }
    case 'logo-strip': {
      let svg = ''
      for (let i = 0; i < 4; i += 1) svg += rect(x + (i * w) / 4, y, w / 4 - 3, 7, ctx.c('muted'), 1.5)
      return { svg, h: 10 }
    }
    case 'social-icons': {
      let svg = ''
      for (let i = 0; i < 4; i += 1) svg += circle(x + 3 + i * 8, y + 3, 3, ctx.c('muted'))
      return { svg, h: 9 }
    }
    case 'counter':
    case 'progress-bar':
    case 'star-rating':
      return { svg: rect(x, y, w * 0.4, 6, ctx.c('ink'), 1.2) + rect(x, y + 9, w, 2, ctx.c('line'), 1) + rect(x, y + 9, w * 0.6, 2, ctx.c('accent'), 1), h: 14 }
    case 'divider':
      return { svg: rect(x, y + 1, w, 0.8, ctx.c('muted'), 0.4), h: 4 }
    case 'spacer':
      return { svg: '', h: 8 }
    case 'map':
      return { svg: picture(ctx, x, y, w, 24), h: 27 }
    case 'text-editor':
    default:
      return { svg: textLines(ctx, x, y, w, 3).svg, h: 15 }
  }
}

function drawNode(ctx: Ctx, node: SectionNode, x: number, y: number, w: number, depth: number): Drawn {
  switch (node.blockType) {
    case 'hero': {
      const h = 50
      const bars = headlineBars(ctx, x + 10, y + 11, w - 20, true, ctx.c('surface'))
      return {
        svg: rect(x, y, w, h, ctx.c('ink'), 2) + bars.svg + textLines(ctx, x + w * 0.25, y + 28, w * 0.5, 1, ctx.c('muted')).svg + pill(ctx, x, y + 37, w, true),
        h: h + 4,
      }
    }
    case 'imageText': {
      const imageLeft = node.imageSide !== 'right'
      const colW = (w - 6) / 2
      const imgX = imageLeft ? x : x + colW + 6
      const txtX = imageLeft ? x + colW + 6 : x
      return {
        svg: picture(ctx, imgX, y, colW, 34) + headlineBars(ctx, txtX, y + 3, colW, false).svg + textLines(ctx, txtX, y + 18, colW, 3).svg,
        h: 38,
      }
    }
    case 'gallery': {
      const cols = 3
      const gap = 3
      const size = (w - gap * (cols - 1)) / cols
      let svg = rect(x + w * 0.3, y, w * 0.4, 3, ctx.c('ink'), 1)
      for (let r = 0; r < 2; r += 1) for (let i = 0; i < cols; i += 1) svg += picture(ctx, x + i * (size + gap), y + 7 + r * (size + gap), size, size)
      return { svg, h: 7 + size * 2 + gap + 3 }
    }
    case 'ctaBanner': {
      const dark = node.style !== 'light'
      const fill = dark ? ctx.c('ink') : ctx.c('surface')
      const bar = dark ? ctx.c('surface') : ctx.c('ink')
      return { svg: rect(x, y, w, 26, fill, 2, dark ? undefined : ctx.c('line')) + rect(x + w * 0.2, y + 6, w * 0.6, 3.5, bar, 1) + pill(ctx, x, y + 15, w, true), h: 30 }
    }
    case 'faq': {
      let svg = rect(x + w * 0.25, y, w * 0.5, 3, ctx.c('ink'), 1)
      for (let i = 0; i < 4; i += 1) svg += rect(x, y + 7 + i * 9, w, 7, ctx.c('surface'), 1.5, ctx.c('line')) + rect(x + 3, y + 9.5 + i * 9, w * 0.45, 2, ctx.c('muted'), 1) + rect(x + w - 8, y + 9.5 + i * 9, 4, 2, ctx.c('accent'), 1)
      return { svg, h: 7 + 4 * 9 + 2 }
    }
    case 'productGrid': {
      const cols = 4
      const gap = 3
      const cw = (w - gap * (cols - 1)) / cols
      let svg = rect(x, y, w * 0.25, 3, ctx.c('ink'), 1)
      for (let i = 0; i < cols; i += 1) {
        const cx = x + i * (cw + gap)
        svg += rect(cx, y + 7, cw, 30, ctx.c('surface'), 1.5, ctx.c('line')) + picture(ctx, cx + 1.5, y + 8.5, cw - 3, 17) + rect(cx + 2, y + 28, cw - 4, 2, ctx.c('muted'), 1) + rect(cx + 2, y + 32, cw * 0.4, 2, ctx.c('accent'), 1)
      }
      return { svg, h: 41 }
    }
    case 'eventGrid':
    case 'loop': {
      const cols = 3
      const gap = 3
      const cw = (w - gap * (cols - 1)) / cols
      let svg = ''
      for (let i = 0; i < cols; i += 1) svg += rect(x + i * (cw + gap), y, cw, 28, ctx.c('surface'), 1.5, ctx.c('line')) + rect(x + i * (cw + gap) + 2, y + 4, cw - 4, 2, ctx.c('muted'), 1)
      return { svg, h: 32 }
    }
    case 'form': {
      let svg = rect(x + w * 0.3, y, w * 0.4, 3, ctx.c('ink'), 1)
      for (let i = 0; i < 3; i += 1) svg += rect(x + w * 0.15, y + 7 + i * 9, w * 0.7, 6, ctx.c('surface'), 1.5, ctx.c('line'))
      svg += rect(x + w * 0.15, y + 7 + 3 * 9, w * 0.25, 6, ctx.c('accent'), 3)
      return { svg, h: 7 + 4 * 9 }
    }
    case 'richText': {
      const t = textLines(ctx, x, y, w, 4)
      return { svg: t.svg, h: t.h + 4 }
    }
    case 'reusableSection':
      return { svg: rect(x, y, w, 20, ctx.c('surface'), 2, ctx.c('accent')) + rect(x + 4, y + 8, w * 0.4, 3, ctx.c('muted'), 1), h: 24 }
    case 'element': {
      const d = drawElement(ctx, elementType(node), x, y, w)
      return { svg: d.svg, h: d.h + 3 }
    }
    case 'section': {
      const columns = Array.isArray(node.columns) ? node.columns : []
      if (columns.length === 0 || depth >= MAX_DEPTH) return { svg: rect(x, y, w, 14, ctx.c('surface'), 2, ctx.c('line')), h: 18 }
      const gap = 4
      const usable = w - gap * (columns.length - 1)
      const weights = columns.map((col) => (typeof col.width === 'number' && col.width > 0 ? col.width : 12 / columns.length))
      const total = weights.reduce((sum, v) => sum + v, 0)
      let cursor = x
      let svg = ''
      let tallest = 0
      columns.forEach((col, i) => {
        const cw = (usable * weights[i]) / total
        let cy = y
        for (const child of asNodes(col.blocks)) {
          if (cy - y > HEIGHT) break
          const drawn = drawNode(ctx, child, cursor, cy, cw, depth + 1)
          svg += drawn.svg
          cy += drawn.h
        }
        tallest = Math.max(tallest, cy - y)
        cursor += cw + gap
      })
      return { svg, h: Math.max(tallest, 10) + 2 }
    }
    default:
      return { svg: rect(x, y, w, 14, ctx.c('surface'), 2, ctx.c('line')) + rect(x + 4, y + 6, w * 0.4, 2, ctx.c('muted'), 1), h: 18 }
  }
}

/** The SVG markup itself (160x120, 4:3), for inlining in a page. */
export function renderTemplateThumbnailSvg(nodes: SectionNode[], palette: Partial<ThumbnailPalette> = {}): string {
  const colours: ThumbnailPalette = { ...DEFAULT_THUMBNAIL_PALETTE, ...palette }
  const ctx: Ctx = { c: (name) => `var(--tpl-${name},${colours[name]})` }
  const list = asNodes(nodes)

  let body = ''
  let y = PAD
  for (const node of list) {
    if (y >= HEIGHT) break
    const drawn = drawNode(ctx, node, PAD, y, WIDTH - PAD * 2, 0)
    body += drawn.svg
    y += drawn.h
  }
  const contentHeight = Math.max(0, y - PAD)
  // Very small templates (one element) are enlarged and centred so the card is not a blank rectangle.
  const available = HEIGHT - PAD * 2
  const scale = contentHeight > 0 && contentHeight < available * 0.55 ? Math.min(1.8, (available * 0.8) / contentHeight) : 1
  const shownHeight = Math.min(contentHeight, available) * scale
  const offsetY = scale > 1 ? (HEIGHT - shownHeight) / 2 - PAD * scale : 0
  const offsetX = scale > 1 ? (WIDTH - WIDTH * scale) / 2 : 0
  const group = scale > 1 ? `<g transform="translate(${n(offsetX)} ${n(offsetY)}) scale(${n(scale)})">${body}</g>` : body
  const empty = list.length === 0 ? rect(PAD, PAD, WIDTH - PAD * 2, HEIGHT - PAD * 2, ctx.c('surface'), 3, ctx.c('line')) : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Template preview">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" style="fill:${ctx.c('bg')}"/>` +
    empty +
    group +
    '</svg>'
  )
}

/** The wireframe as a `data:` URL, ready for an <img src>. */
export function renderTemplateThumbnail(nodes: SectionNode[], palette: Partial<ThumbnailPalette> = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderTemplateThumbnailSvg(nodes, palette))}`
}
