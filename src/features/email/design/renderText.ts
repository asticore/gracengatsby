/**
 * The plain-text alternative of a designed email. Mail clients show it to people
 * who turn HTML off, and spam filters expect it to exist.
 */

import type { TemplateValues } from '../renderTemplate'

import { type EmailBrand, brandFrom } from './brand'
import { fillPlain, inlineToPlain, isSafeUrl } from './inline'
import type { ColumnBlock, EmailBlock } from './types'

const RULE = '----------------------------------------'

const fillUrl = (url: string, vars: TemplateValues): string => fillPlain(url, vars).trim()

const blockText = (block: EmailBlock | ColumnBlock, vars: TemplateValues): string => {
  switch (block.type) {
    case 'heading':
      return fillPlain(block.text, vars).trim()
    case 'text':
      return block.text
        .split(/\n{2,}/)
        .map((paragraph) => inlineToPlain(paragraph.trim(), vars))
        .filter((paragraph) => paragraph !== '')
        .join('\n\n')
    case 'button': {
      const url = fillUrl(block.url, vars)
      const label = fillPlain(block.label, vars).trim()
      return isSafeUrl(url) ? `${label}: ${url}` : label
    }
    case 'image': {
      const url = block.link ? fillUrl(block.link, vars) : ''
      const alt = fillPlain(block.alt, vars).trim()
      const parts = [alt ? `[Image: ${alt}]` : '', isSafeUrl(url) ? url : ''].filter(Boolean)
      return parts.join(' ')
    }
    case 'social':
      return block.links
        .filter((link) => isSafeUrl(link.url))
        .map((link) => `${link.network}: ${link.url.trim()}`)
        .join('\n')
    case 'footerNote':
      return fillPlain(block.text, vars).trim()
    case 'divider':
      return RULE
    default:
      return ''
  }
}

/** The whole email as plain text. Values are not escaped here: this is not HTML. */
export const renderEmailText = (blocks: EmailBlock[], input: EmailBrand, vars: TemplateValues = {}): string => {
  const brand = brandFrom(input)
  const pieces: string[] = []
  for (const block of blocks) {
    if (block.type === 'spacer') continue
    if (block.type === 'columns2') {
      for (const item of [...block.left, ...block.right]) pieces.push(blockText(item, vars))
      continue
    }
    pieces.push(blockText(block, vars))
  }
  const footer = [brand.footerText ? fillPlain(brand.footerText, vars).trim() : '', brand.address ? fillPlain(brand.address, vars).trim() : '']
  pieces.push(...footer)
  return `${pieces.filter((piece) => piece !== '').join('\n\n')}\n`
}
