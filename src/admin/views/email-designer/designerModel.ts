import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { EMAIL_BLOCK_TYPES, type ColumnBlock, type EmailBlock, type EmailBlockType, type SocialNetwork, SOCIAL_NETWORKS } from '@/features/email/design/types'

/**
 * Pure helpers for the Email designer screen: making and moving blocks, the
 * plain-English labels, and the sample values used by the live preview. No
 * React and no I/O, so the rules can be tested on their own.
 */

export const BLOCK_LABELS: Record<EmailBlockType, string> = {
  heading: 'Heading',
  text: 'Paragraph',
  button: 'Button',
  image: 'Image',
  divider: 'Line',
  spacer: 'Space',
  columns2: 'Two columns',
  social: 'Social links',
  footerNote: 'Small print',
}

export const BLOCK_HELP: Record<EmailBlockType, string> = {
  heading: 'A large title line.',
  text: 'Normal writing. A blank line starts a new paragraph. Use **bold** and [link text](https://...).',
  button: 'A clickable button that opens a web address.',
  image: 'A picture from a web address. Always fill in the description for people who cannot see it.',
  divider: 'A thin line between parts of the email.',
  spacer: 'Empty space of a set height.',
  columns2: 'Two side-by-side columns on a computer. They stack on a phone.',
  social: 'Links to your social media pages.',
  footerNote: 'Small grey text at the foot of the email.',
}

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  website: 'Website',
}

export const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
] as const

/** Block types a two-column cell may hold. */
export const COLUMN_TYPES: EmailBlockType[] = ['text', 'button', 'image']

/** A new block of the given type, with simple wording the admin can change. */
export const createBlock = (type: EmailBlockType): EmailBlock => {
  switch (type) {
    case 'heading':
      return { type, text: 'Your heading', level: 1, align: 'left' }
    case 'text':
      return { type, text: 'Write your message here.', align: 'left' }
    case 'button':
      return { type, label: 'Open', url: 'https://example.com', align: 'center' }
    case 'image':
      return { type, src: 'https://example.com/picture.jpg', alt: '', width: 600 }
    case 'divider':
      return { type }
    case 'spacer':
      return { type, height: 20 }
    case 'columns2':
      return {
        type,
        left: [{ type: 'text', text: 'Left column', align: 'left' }],
        right: [{ type: 'text', text: 'Right column', align: 'left' }],
      }
    case 'social':
      return { type, links: [{ network: 'website', url: 'https://example.com' }] }
    case 'footerNote':
      return { type, text: 'Small print goes here.' }
  }
}

/** A new column cell of the given type. Only text, button and image are allowed in columns. */
export const createColumnBlock = (type: EmailBlockType): ColumnBlock => {
  const block = createBlock(COLUMN_TYPES.includes(type) ? type : 'text')
  return block as ColumnBlock
}

export const isColumnType = (type: EmailBlockType): boolean => COLUMN_TYPES.includes(type)

/** Short plain-English summary of a block, for its row in the list. */
export const blockSummary = (block: EmailBlock | ColumnBlock): string => {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'footerNote':
      return firstWords(block.text)
    case 'button':
      return block.label || 'Button'
    case 'image':
      return block.alt || block.src
    case 'columns2':
      return `${block.left.length} left, ${block.right.length} right`
    case 'social':
      return `${block.links.length} link(s)`
    case 'spacer':
      return `${block.height} px`
    case 'divider':
      return ''
  }
}

const firstWords = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean
}

/** Returns a new list with the item at index replaced. */
export const replaceAt = <T>(list: T[], index: number, next: T): T[] => list.map((item, i) => (i === index ? next : item))

/** Returns a new list without the item at index. */
export const removeAt = <T>(list: T[], index: number): T[] => list.filter((_item, i) => i !== index)

/** Returns a new list with the item at index moved one place up (-1) or down (+1). Out-of-range moves change nothing. */
export const moveAt = <T>(list: T[], index: number, delta: -1 | 1): T[] => {
  const target = index + delta
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1) as [T]
  next.splice(target, 0, item)
  return next
}

/** Returns a new list with a copy of the item at index placed straight after it. */
export const duplicateAt = <T>(list: T[], index: number): T[] => {
  const item = list[index]
  if (item === undefined) return list
  const next = [...list]
  next.splice(index + 1, 0, structuredClone(item))
  return next
}

/**
 * A first design for a template that has none yet: each paragraph of its current
 * wording becomes a text block, so the admin starts from the words they already have.
 */
export const starterBlocks = (body: string): EmailBlock[] => {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .slice(0, MAX_BLOCKS_FOR_STARTER)
  if (paragraphs.length === 0) return [createBlock('text')]
  return paragraphs.map((text) => ({ type: 'text' as const, text: text.slice(0, 5000), align: 'left' as const }))
}

const MAX_BLOCKS_FOR_STARTER = 40

/** Tags used in a template's default wording, such as "link" for {{link}}, in order of first use. */
export const tagsFor = (key: string): string[] => {
  const defaults = (EMAIL_TEMPLATE_DEFAULTS as Record<string, { subject: string; body: string } | undefined>)[key]
  if (!defaults) return []
  const { subject, body } = defaults
  const found: string[] = []
  for (const match of `${subject}\n${body}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    const tag = match[1] as string
    if (!found.includes(tag)) found.push(tag)
  }
  return found
}

const SAMPLE: Record<string, string> = {
  link: 'https://example.com/your-link',
  signInLink: 'https://example.com/sign-in',
  resetLink: 'https://example.com/reset-password',
  name: 'Sam',
  minutes: '30',
  tier: 'Gold',
  days: '7',
  renewsAt: '1 November 2026',
  eventTitle: 'Summer Supper Club',
  eventDate: 'Saturday 14 November, 7pm',
  when: 'tomorrow',
  guestCount: '2',
  requesterName: 'Alex',
  noun: 'page',
  title: 'Spring newsletter',
  waiting: ' - waiting for Jamie',
  reviewerName: 'Jamie',
  verb: 'approved',
  note: '',
}

/** Sample values for the live preview. A tag with no sample shows its own name in brackets. */
export const sampleVars = (key: string): Record<string, string> => {
  const vars: Record<string, string> = {}
  for (const tag of tagsFor(key)) vars[tag] = SAMPLE[tag] ?? `[${tag}]`
  return vars
}

/** Human label for a template key, taken from the wording field names in the templates global. */
export const TEMPLATE_LABELS: Record<string, string> = {
  accountReset: 'Password reset',
  accountAlreadyRegistered: 'Already registered',
  accountWelcome: 'Account welcome',
  membershipRenewal: 'Membership renewal reminder',
  approvalSubmitted: 'Review requested',
  approvalDecision: 'Review decision',
  rsvpConfirmation: 'Event booking confirmation',
  eventReminder: 'Event reminder',
}

export const templateLabel = (key: string): string => TEMPLATE_LABELS[key] ?? key

export const BLOCK_TYPE_OPTIONS = EMAIL_BLOCK_TYPES.map((value) => ({ value, label: BLOCK_LABELS[value] }))

export const SOCIAL_OPTIONS = SOCIAL_NETWORKS.map((value) => ({ value, label: SOCIAL_LABELS[value] }))
