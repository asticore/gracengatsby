/**
 * Warnings about a design that are not errors: things that hurt accessibility,
 * deliverability or clarity. The admin page shows them; saving is still allowed.
 */

import { DEFAULT_EMAIL_BRAND, type EmailBrand } from './brand'
import { splitInline } from './inline'
import { renderEmailHtml } from './render'
import type { ColumnBlock, EmailBlock } from './types'

export type EmailLintWarning = {
  code: 'empty' | 'image-no-alt' | 'vague-link' | 'no-footer' | 'too-heavy'
  message: string
}

export type LintOptions = {
  /** Marketing email needs a footer with a way to stop receiving it. */
  marketing?: boolean
  /** The brand in use, so a footer set there counts. */
  brand?: EmailBrand
}

/** Gmail clips HTML emails above roughly 102 KB, so warn well before that. */
const MAX_BYTES = 100 * 1024

const VAGUE = /^(click here|here|link|this link|read more|more|click)$/i

const everyBlock = (blocks: EmailBlock[]): (EmailBlock | ColumnBlock)[] => {
  const list: (EmailBlock | ColumnBlock)[] = []
  for (const block of blocks) {
    list.push(block)
    if (block.type === 'columns2') list.push(...block.left, ...block.right)
  }
  return list
}

const vagueLinkIn = (text: string): boolean =>
  splitInline(text).some((part) => part.kind === 'link' && VAGUE.test(part.label.trim()))

export const lintEmail = (blocks: EmailBlock[], options: LintOptions = {}): EmailLintWarning[] => {
  const warnings: EmailLintWarning[] = []
  const brand = options.brand ?? DEFAULT_EMAIL_BRAND
  const all = everyBlock(blocks)

  if (blocks.length === 0) {
    warnings.push({ code: 'empty', message: 'The design is empty. Add a block to see the email.' })
    return warnings
  }

  for (const block of all) {
    if (block.type === 'image' && block.alt.trim() === '') {
      warnings.push({ code: 'image-no-alt', message: 'An image has no description. Add one so people who cannot see images know what it shows.' })
    }
    if (block.type === 'button' && VAGUE.test(block.label.trim())) {
      warnings.push({ code: 'vague-link', message: `The button "${block.label}" does not say where it goes. Use a label such as "View your order".` })
    }
    if (block.type === 'text' && vagueLinkIn(block.text)) {
      warnings.push({ code: 'vague-link', message: 'A link says "click here" or similar. Use the words that describe the page instead.' })
    }
  }

  const hasFooter = blocks.some((block) => block.type === 'footerNote') || brand.footerText.trim() !== ''
  if (options.marketing && !hasFooter) {
    warnings.push({
      code: 'no-footer',
      message: 'Marketing email should end with a footer that says why the reader got it and how to stop receiving it.',
    })
  }

  const bytes = new TextEncoder().encode(renderEmailHtml(blocks, brand)).length
  if (bytes > MAX_BYTES) {
    warnings.push({
      code: 'too-heavy',
      message: `This email is about ${Math.round(bytes / 1024)} KB. Mail apps may cut off emails over about 100 KB, so use fewer or smaller images.`,
    })
  }

  return warnings
}
