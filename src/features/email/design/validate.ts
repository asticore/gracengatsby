/**
 * Server-side checks for a design submitted from the admin page. Nothing the
 * browser sends is trusted: unknown fields are dropped, text is trimmed and
 * capped, numbers are clamped, and links must be http, https or mailto.
 *
 * A URL that is only a {{tag}} (such as {{link}}) is accepted here, because the
 * real address is only known when the email is sent; render.ts drops it then if it is unsafe.
 */

import { cleanColor, isHexColor } from './brand'
import { isSafeUrl } from './inline'
import {
  EMAIL_BLOCK_TYPES,
  EMAIL_LIMITS,
  SOCIAL_NETWORKS,
  type ButtonBlock,
  type ColumnBlock,
  type EmailAlign,
  type EmailBlock,
  type ImageBlock,
  type SocialNetwork,
} from './types'

/** Either the cleaned blocks, or the reason they were refused. Both keys are on both sides so callers can read either without narrowing. */
export type EmailBlocksResult = { ok: true; blocks: EmailBlock[]; error?: undefined } | { ok: false; error: string; blocks?: undefined }

class InvalidDesign extends Error {}

const fail = (message: string): never => {
  throw new InvalidDesign(message)
}

const TAG_ONLY = /^\{\{\s*\w+\s*\}\}$/
const TAG = /\{\{\s*\w+\s*\}\}/g

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, label: string, max: number, required: boolean): string => {
  if (value === undefined || value === null) value = ''
  if (typeof value !== 'string') fail(`${label} must be text.`)
  const trimmed = (value as string).replace(/\r\n?/g, '\n').trim()
  if (required && trimmed === '') fail(`${label} cannot be empty.`)
  if (trimmed.length > max) fail(`${label} is too long (the limit is ${max} characters).`)
  return trimmed
}

const url = (value: unknown, label: string, required: boolean, httpOnly = false): string => {
  const trimmed = text(value, label, EMAIL_LIMITS.maxUrl, required)
  if (trimmed === '') return ''
  if (TAG_ONLY.test(trimmed)) return trimmed
  const check = trimmed.replace(TAG, 'x')
  const ok = httpOnly ? /^https?:\/\/[^\s]+$/i.test(check) : isSafeUrl(check)
  if (!ok) fail(`${label} must start with http://, https://${httpOnly ? '' : ' or mailto:'} and have no spaces.`)
  return trimmed
}

const align = (value: unknown): EmailAlign => (value === 'center' || value === 'right' ? value : 'left')

const number = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

const columnBlock = (raw: unknown, side: string): ColumnBlock => {
  if (!isObject(raw)) fail(`A block in the ${side} column is not valid.`)
  const block = raw as Record<string, unknown>
  switch (block.type) {
    case 'text':
      return { type: 'text', text: text(block.text, 'Text', EMAIL_LIMITS.maxText, true), align: align(block.align) }
    case 'button':
      return buttonBlock(block, align(block.align))
    case 'image':
      return imageBlock(block)
    default:
      return fail(`Only text, button and image blocks fit in a column (found "${String(block.type)}" in the ${side} column).`)
  }
}

const buttonBlock = (block: Record<string, unknown>, blockAlign: EmailAlign): ButtonBlock => {
  const color = typeof block.color === 'string' && block.color.trim() !== '' ? block.color.trim() : ''
  if (color && !isHexColor(color)) fail('Button colour must be a hex colour such as #1a5c4f, or left blank.')
  return {
    type: 'button',
    label: text(block.label, 'Button label', EMAIL_LIMITS.maxLabel, true),
    url: url(block.url, 'Button link', true),
    ...(color ? { color: cleanColor(color, '#1a5c4f') } : {}),
    align: blockAlign,
  }
}

const imageBlock = (block: Record<string, unknown>): ImageBlock => {
  const link = url(block.link, 'Image link', false)
  return {
    type: 'image',
    src: url(block.src, 'Image address', true, true),
    alt: text(block.alt, 'Image description', EMAIL_LIMITS.maxAlt, false),
    width: number(block.width, 1, 600, 600),
    ...(link ? { link } : {}),
    align: align(block.align ?? 'center'),
  }
}

const blockOf = (raw: unknown): EmailBlock => {
  if (!isObject(raw)) fail('A block in the design is not valid.')
  const source = raw as Record<string, unknown>
  const type = source.type
  if (typeof type !== 'string' || !(EMAIL_BLOCK_TYPES as string[]).includes(type)) fail(`Unknown block type "${String(type)}".`)
  switch (type) {
    case 'heading':
      return {
        type: 'heading',
        text: text(source.text, 'Heading', EMAIL_LIMITS.maxHeading, true),
        level: number(source.level, 1, 3, 2) as 1 | 2 | 3,
        align: align(source.align),
      }
    case 'text':
      return { type: 'text', text: text(source.text, 'Text', EMAIL_LIMITS.maxText, true), align: align(source.align) }
    case 'button':
      return buttonBlock(source, align(source.align))
    case 'image':
      return imageBlock(source)
    case 'divider':
      return { type: 'divider' }
    case 'spacer':
      return { type: 'spacer', height: number(source.height, 4, 200, 24) }
    case 'columns2': {
      const side = (value: unknown, name: string): ColumnBlock[] => {
        if (!Array.isArray(value)) fail(`The ${name} column must be a list of blocks.`)
        const list = value as unknown[]
        if (list.length > EMAIL_LIMITS.maxColumnBlocks) fail(`A column can hold at most ${EMAIL_LIMITS.maxColumnBlocks} blocks.`)
        return list.map((item) => columnBlock(item, name))
      }
      return { type: 'columns2', left: side(source.left, 'left'), right: side(source.right, 'right') }
    }
    case 'social': {
      const links = Array.isArray(source.links) ? (source.links as unknown[]) : []
      if (links.length > 8) fail('Social links: at most 8.')
      return {
        type: 'social',
        links: links.map((item) => {
          const link = isObject(item) ? item : fail('A social link is not valid.')
          const network = link.network
          if (typeof network !== 'string' || !(SOCIAL_NETWORKS as readonly string[]).includes(network)) fail('Pick a social network from the list.')
          return { network: network as SocialNetwork, url: url(link.url, 'Social link', true, true) }
        }),
      }
    }
    case 'footerNote':
      return { type: 'footerNote', text: text(source.text, 'Footer note', EMAIL_LIMITS.maxFooterNote, true) }
    default:
      return fail(`Unknown block type "${type}".`)
  }
}

/**
 * Checks and cleans a submitted design. Returns the cleaned blocks, or a
 * plain-English reason it was refused. Never throws.
 */
export const validateEmailBlocks = (input: unknown): EmailBlocksResult => {
  try {
    if (!Array.isArray(input)) return { ok: false, error: 'The design must be a list of blocks.' }
    if (input.length > EMAIL_LIMITS.maxBlocks) return { ok: false, error: `A design can have at most ${EMAIL_LIMITS.maxBlocks} blocks.` }
    return { ok: true, blocks: input.map((item) => blockOf(item)) }
  } catch (error) {
    if (error instanceof InvalidDesign) return { ok: false, error: error.message }
    return { ok: false, error: 'The design could not be read.' }
  }
}
