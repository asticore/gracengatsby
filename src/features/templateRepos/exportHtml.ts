import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CtaBannerBlock } from '@/components/blocks/CtaBannerBlock'
import { GalleryBlock } from '@/components/blocks/GalleryBlock'
import { HeroBlock } from '@/components/blocks/HeroBlock'
import { ImageTextBlock } from '@/components/blocks/ImageTextBlock'
import { RichTextBlock } from '@/components/blocks/RichTextBlock'
import { SectionBlock } from '@/components/blocks/SectionBlock'
import { StyledBlock } from '@/components/blocks/StyledBlock'
import { MEDIA_PROP_KEYS, substituteMedia, type MediaRef } from '@/components/blocks/elements/elementUtil'
import { renderElement } from '@/components/blocks/elements/renderElement'
import { getElementDef } from '@/lib/elements/registry'
import { SITE_ELEMENT_TYPES } from '@/lib/elements/wave38Defs'
import type { SectionNode } from '@/lib/sectionTree'

import { isDeniedNodeType } from './manifest'

/**
 * "Download HTML": a page or section tree as one standalone HTML document.
 *
 * It never touches the database. Blocks and elements that read live site data
 * (product and event grids, forms, FAQ, loops, reusable sections, site elements,
 * ads, data views) are left out and replaced by an HTML comment, as are raw HTML
 * elements and element types this editor does not know. Block Design CSS is
 * inlined (each block carries its own scoped <style>), plus a small base sheet.
 *
 * Not inlined: the site theme (fonts, colour variables, Tailwind utilities and
 * the shared component stylesheets). The file is a faithful copy of structure,
 * content and per-block design, not a pixel-exact copy of the live page.
 * Pictures chosen by media id appear only when `media` supplies their URLs.
 */

export type StaticHtmlOptions = {
  title?: string
  lang?: string
  /** Media id to {url, alt}, so pictures chosen from the library have an address in the file. */
  media?: Map<number, MediaRef>
  /** Where the live site is, to turn site-relative picture links into absolute ones. No trailing slash. */
  baseUrl?: string
}

export type StaticHtmlResult = { html: string; skipped: string[]; note: string }

export const STATIC_HTML_NOTE =
  'Theme fonts, colours and shared site stylesheets are not included, so spacing and typography can differ from the live page.'

const SERVER_BLOCKS = new Set(['productGrid', 'eventGrid', 'faq', 'form', 'loop', 'reusableSection', 'toc'])
const SERVER_ELEMENTS = new Set(['ad', 'data-view', 'content-slot'])

const BASE_CSS =
  '*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5;color:#111}img,video{max-width:100%;height:auto}'

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Text for inside an HTML comment: no way to close it early. */
const commentText = (text: string): string => text.replace(/[^A-Za-z0-9 :._-]/g, '').slice(0, 80)

export function treeToStaticHtml(tree: readonly SectionNode[], options: StaticHtmlOptions = {}): StaticHtmlResult {
  const skipped: string[] = []
  const skip = (what: string): React.ReactNode => {
    skipped.push(what)
    return React.createElement(Comment, { text: `Not exported: ${commentText(what)}` })
  }

  const renderNode = (block: SectionNode, key: string): React.ReactNode => {
    const get = <T,>(name: string): T => block[name] as T
    switch (block.blockType) {
      case 'section':
        return React.createElement(SectionBlock, { columns: block.columns, renderNode, design: block.design, scope: `t${key}` })
      case 'hero':
        return React.createElement(HeroBlock, {
          heading: get('heading'),
          subheading: get('subheading'),
          backgroundImage: get('backgroundImage'),
          primaryCtaLabel: get('primaryCtaLabel'),
          primaryCtaUrl: get('primaryCtaUrl'),
          secondaryCtaLabel: get('secondaryCtaLabel'),
          secondaryCtaUrl: get('secondaryCtaUrl'),
        } as never)
      case 'richText':
        return React.createElement(RichTextBlock, { content: get('content') } as never)
      case 'imageText':
        return React.createElement(ImageTextBlock, { image: get('image'), content: get('content'), imageSide: get('imageSide') } as never)
      case 'gallery':
        return React.createElement(GalleryBlock, { heading: get('heading'), images: get('images') } as never)
      case 'ctaBanner':
        return React.createElement(CtaBannerBlock, {
          heading: get('heading'),
          text: get('text'),
          buttonLabel: get('buttonLabel'),
          buttonUrl: get('buttonUrl'),
          style: get('style'),
        } as never)
      case 'element': {
        const type = typeof block.elementType === 'string' ? block.elementType : ''
        if (!type || !getElementDef(type)) return skip(`unknown element ${type || '(no type)'}`)
        if (isDeniedNodeType(type)) return skip(`raw code element ${type}`)
        if (SERVER_ELEMENTS.has(type) || SITE_ELEMENT_TYPES.has(type)) return skip(`${type} (reads live site data)`)
        let props = (block.props as Record<string, unknown>) || {}
        const mediaKeys = MEDIA_PROP_KEYS[type]
        if (mediaKeys && options.media) props = substituteMedia(props, [...mediaKeys], options.media)
        const out = renderElement(type, props, block.design, `el-${key}`)
        return out ?? skip(`${type} (no static output)`)
      }
      default:
        return SERVER_BLOCKS.has(block.blockType) ? skip(`${block.blockType} block (reads live site data)`) : skip(`unknown block ${block.blockType}`)
    }
  }

  const body = tree
    .map((node, index) => {
      if (!node || typeof node.blockType !== 'string') return ''
      try {
        return renderToStaticMarkup(React.createElement(StyledBlock as React.ComponentType<{ style?: unknown; index: number; children?: React.ReactNode }>, { style: node.design, index }, renderNode(node, String(index))))
      } catch {
        skipped.push(`${commentText(node.blockType)} (could not be drawn)`)
        return `<!-- Not exported: ${commentText(node.blockType)} could not be drawn -->`
      }
    })
    .join('\n')

  let html = body.replace(/<span hidden="" data-export-skipped="([A-Za-z0-9 :._-]*)"><\/span>/g, '<!-- $1 -->')
  if (options.baseUrl) {
    const base = options.baseUrl.replace(/\/+$/, '')
    html = html.replace(/(src|href|poster)="\/(?!\/)/g, `$1="${escapeHtml(base)}/`).replace(/url\(\/(?!\/)/g, `url(${base}/`)
  }

  const doc =
    `<!doctype html>\n<html lang="${escapeHtml(options.lang || 'en')}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(options.title || 'Exported page')}</title>\n` +
    `<style>${BASE_CSS}</style>\n</head>\n<body>\n<!-- ${STATIC_HTML_NOTE} -->\n${html}\n</body>\n</html>\n`
  return { html: doc, skipped, note: STATIC_HTML_NOTE }
}

/** A marker that treeToStaticHtml turns into a real HTML comment (React cannot render comments). */
function Comment({ text }: { text: string }): React.ReactElement {
  return React.createElement('span', { hidden: true, 'data-export-skipped': text })
}
